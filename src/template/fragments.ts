import type { Stats } from 'node:fs';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CliError } from '../errors.js';
import type { ProjectType } from '../types.js';
import {
  compareStrings,
  expectedCapabilities,
  isRelativePosixPath,
  sortCapabilities
} from './manifest.js';
import type { FragmentIndex, FragmentIndexEntry } from './manifest.js';
import {
  isMissingFileError,
  normalizeNewlines,
  PACKAGE_JSON_FILE,
  renderOutputPath
} from './paths.js';
import type {
  FragmentManifest,
  ResolvedFile,
  TemplateTokens
} from './types.js';
import { assertNoUnresolvedTokens, renderTokens } from './validate.js';

export function defaultTemplateRoot(): string {
  return fileURLToPath(new URL('../../templates', import.meta.url));
}

function fail(message: string, hint?: string): never {
  throw CliError.generation(message, hint);
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function findFragmentEntry(
  index: FragmentIndex,
  id: string,
  kind: FragmentIndexEntry['kind'],
  label: string
): FragmentIndexEntry {
  const entry = index.fragments.find((candidate) => candidate.id === id);
  if (!entry) {
    fail(
      `Template fragment index is missing the ${label} fragment "${id}".`
    );
  }
  if (entry.kind !== kind) {
    fail(
      `Template fragment "${id}" must have kind "${kind}", got "${entry.kind}".`
    );
  }
  return entry;
}

function resolveInside(
  root: string,
  relative: string,
  label: string
): string {
  if (!isRelativePosixPath(relative)) {
    fail(`Template ${label} path ${JSON.stringify(relative)} is not a safe relative POSIX path.`);
  }
  const rootPath = path.resolve(root);
  const target = path.resolve(rootPath, ...relative.split('/'));
  const fromRoot = path.relative(rootPath, target);
  if (
    fromRoot.length === 0 ||
    fromRoot.startsWith('..') ||
    path.isAbsolute(fromRoot)
  ) {
    fail(`Template ${label} path ${JSON.stringify(relative)} escapes its template root.`);
  }
  return target;
}

async function inspectTemplatePath(
  root: string,
  relative: string,
  label: string
): Promise<Stats> {
  let current = path.resolve(root);
  let stats: Stats | undefined;
  for (const segment of relative.split('/')) {
    current = path.join(current, segment);
    try {
      stats = await lstat(current);
    } catch (error) {
      if (isMissingFileError(error)) {
        fail(`Template ${label} not found: ${JSON.stringify(relative)}.`);
      }
      throw CliError.generation(
        `Unable to inspect template ${label} ${JSON.stringify(relative)}: ${errorText(error)}`
      );
    }
    if (stats.isSymbolicLink()) {
      fail(
        `Template ${label} ${JSON.stringify(relative)} contains a symbolic link at "${segment}", which is not allowed.`
      );
    }
  }
  if (!stats) {
    fail(`Template ${label} path ${JSON.stringify(relative)} is empty.`);
  }
  return stats;
}

export async function resolveFragmentDirectory(
  templateRoot: string,
  entry: FragmentIndexEntry
): Promise<string> {
  const stats = await inspectTemplatePath(
    templateRoot,
    entry.path,
    `fragment "${entry.id}"`
  );
  if (!stats.isDirectory()) {
    fail(
      `Template fragment "${entry.id}" path "${entry.path}" is not a directory.`
    );
  }
  return resolveInside(templateRoot, entry.path, `fragment "${entry.id}"`);
}

async function readTemplateFile(
  fragmentDir: string,
  relative: string,
  fragmentId: string
): Promise<Uint8Array> {
  const stats = await inspectTemplatePath(
    fragmentDir,
    relative,
    `file "${relative}" in fragment "${fragmentId}"`
  );
  if (!stats.isFile()) {
    fail(
      `Template file "${relative}" in fragment "${fragmentId}" is not a regular file.`
    );
  }
  if (stats.nlink > 1) {
    fail(
      `Template file "${relative}" in fragment "${fragmentId}" is a hard link, which is not allowed.`
    );
  }
  return readFile(resolveInside(fragmentDir, relative, `file "${relative}"`));
}

function contentsEqual(
  left: string | Uint8Array,
  right: string | Uint8Array
): boolean {
  if (typeof left === 'string' && typeof right === 'string') {
    return left === right;
  }
  if (left instanceof Uint8Array && right instanceof Uint8Array) {
    if (left.byteLength !== right.byteLength) return false;
    for (let index = 0; index < left.byteLength; index += 1) {
      if (left[index] !== right[index]) return false;
    }
    return true;
  }
  return false;
}

export async function addFragmentFile(options: {
  files: Map<string, ResolvedFile>;
  warnings: string[];
  manifest: FragmentManifest;
  fragmentDir: string;
  relative: string;
  binary: boolean;
  tokens: TemplateTokens;
}): Promise<void> {
  const {
    files,
    warnings,
    manifest,
    fragmentDir,
    relative,
    binary,
    tokens
  } = options;

  if (relative === PACKAGE_JSON_FILE) {
    fail(
      `Fragment "${manifest.id}" declares "${PACKAGE_JSON_FILE}" as a file. Declare package data in the fragment manifest instead.`
    );
  }

  const outputPath = renderOutputPath(relative);
  const raw = await readTemplateFile(fragmentDir, relative, manifest.id);
  let contents: string | Uint8Array;
  if (binary) {
    contents = new Uint8Array(raw);
  } else {
    const text = normalizeNewlines(Buffer.from(raw).toString('utf8'));
    const rendered = renderTokens(text, tokens);
    assertNoUnresolvedTokens(rendered, outputPath);
    contents = rendered;
  }

  const existing = files.get(outputPath);
  if (existing) {
    if (
      existing.binary === binary &&
      contentsEqual(existing.contents, contents)
    ) {
      warnings.push(
        `Fragment "${manifest.id}" repeats "${outputPath}" with identical contents; keeping the copy from "${existing.fragmentId}".`
      );
      return;
    }
    fail(
      `Conflicting file "${outputPath}" produced by fragments "${existing.fragmentId}" and "${manifest.id}".`
    );
  }

  files.set(outputPath, {
    path: outputPath,
    contents,
    binary,
    fragmentId: manifest.id
  });
}

function capabilitySet(values: Iterable<string>): Set<string> {
  return new Set(values);
}

function setsEqual(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

function formatSet(values: Iterable<string>): string {
  const sorted = [...values].sort(compareStrings);
  return sorted.length === 0 ? '(none)' : sorted.join(', ');
}

export function resolveFragmentCapabilities(
  type: ProjectType,
  manifests: FragmentManifest[]
): string[] {
  const typeManifest = manifests[1];
  if (!typeManifest) {
    fail('The type fragment is required to resolve capabilities.');
  }
  const declared = capabilitySet(typeManifest.capabilities ?? []);
  const expected = capabilitySet(expectedCapabilities(type));
  if (!setsEqual(declared, expected)) {
    fail(
      `Type fragment "${typeManifest.id}" declares capabilities ${formatSet(declared)} but "${type}" requires ${formatSet(expected)}.`
    );
  }

  const union = new Set<string>();
  for (const manifest of manifests) {
    for (const capability of manifest.capabilities ?? []) {
      union.add(capability);
    }
  }
  if (!setsEqual(union, declared)) {
    fail(
      `Merged capabilities ${formatSet(union)} do not equal the type fragment's declared set ${formatSet(declared)}.`
    );
  }
  return sortCapabilities(union);
}

export function assertFragmentRequires(
  entries: FragmentIndexEntry[],
  manifests: FragmentManifest[]
): void {
  const ids = entries.map((entry) => entry.id);
  manifests.forEach((manifest, index) => {
    for (const required of manifest.requires ?? []) {
      const requiredIndex = ids.indexOf(required);
      if (requiredIndex === -1) {
        fail(
          `Fragment "${manifest.id}" requires "${required}", which is not part of the resolved fragment set.`
        );
      }
      if (requiredIndex >= index) {
        fail(
          `Fragment "${manifest.id}" requires "${required}", which must be resolved before it.`
        );
      }
    }
  });
}
