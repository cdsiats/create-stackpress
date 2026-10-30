import { CliError } from '../errors.js';
import {
  assertRelativePosixPath,
  compareStrings,
  expectedCapabilities,
  isCanonicalCapability,
  isTokenName,
  parseEnvLine
} from './manifest.js';
import type {
  ResolvedFile,
  ResolvedProject,
  TemplateTokens
} from './types.js';

const TOKEN_PATTERN_SOURCE = '\\{\\{\\s*([A-Za-z0-9_-]+)\\s*\\}\\}';
const UNRESOLVED_TOKEN_PATTERN_SOURCE = '\\{\\{\\s*([^{}]*?)\\s*\\}\\}';

function fail(message: string, hint?: string): never {
  throw CliError.generation(message, hint);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function renderTokens(text: string, tokens: TemplateTokens): string {
  const pattern = new RegExp(TOKEN_PATTERN_SOURCE, 'g');
  return text.replace(pattern, (match: string, name: string) => {
    if (!isTokenName(name)) return match;
    const value = tokens[name];
    return value === undefined ? match : value;
  });
}

export function findUnresolvedTokens(text: string): string[] {
  const pattern = new RegExp(UNRESOLVED_TOKEN_PATTERN_SOURCE, 'g');
  const names = new Set<string>();
  for (const match of text.matchAll(pattern)) {
    names.add((match[1] ?? '').trim());
  }
  return [...names].sort(compareStrings);
}

export function assertNoUnresolvedTokens(text: string, source: string): void {
  const names = findUnresolvedTokens(text);
  if (names.length === 0) return;
  const rendered = names.map((name) => `{{${name}}}`).join(', ');
  fail(
    `Unresolved template token${names.length === 1 ? '' : 's'} in "${source}": ${rendered}.`
  );
}

export function validateFileContents(file: ResolvedFile): void {
  assertRelativePosixPath(file.path, 'path', 'rendered project');
  if (file.binary) {
    if (!(file.contents instanceof Uint8Array)) {
      fail(`Binary file "${file.path}" must have Uint8Array contents.`);
    }
    return;
  }
  if (typeof file.contents !== 'string') {
    fail(`Text file "${file.path}" must have string contents.`);
  }
  // `.env` is generated from the user-supplied `--db-url`, not from template
  // text. Scanning it for `{{...}}` could echo part of a secret in an error.
  if (file.path === '.env') return;
  assertNoUnresolvedTokens(file.contents, file.path);
}

function assertUniqueStrings(
  values: string[],
  label: string,
  source: string
): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      fail(`Duplicate ${label} "${value}" in ${source}.`);
    }
    seen.add(value);
  }
}

function collectStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap((entry) => collectStrings(entry));
  if (isPlainObject(value)) {
    return Object.values(value).flatMap((entry) => collectStrings(entry));
  }
  return [];
}

function validatePackageJson(project: ResolvedProject): void {
  const packageJson = project.packageJson;
  if (!isPlainObject(packageJson)) {
    fail('Rendered package.json must be an object.');
  }
  if (packageJson.name !== project.plan.packageName) {
    fail(
      `Rendered package.json name "${String(packageJson.name)}" does not match the plan package name "${project.plan.packageName}".`
    );
  }
  if (packageJson.private !== true) {
    fail('Rendered package.json must set "private" to true.');
  }
  if (packageJson.type !== 'module') {
    fail('Rendered package.json must set "type" to "module".');
  }
  const engines = packageJson.engines;
  if (!isPlainObject(engines) || engines.node !== '>=22') {
    fail('Rendered package.json must set "engines.node" to ">=22".');
  }

  for (const text of collectStrings(packageJson)) {
    assertNoUnresolvedTokens(text, 'package.json');
  }

  const renderedPlugins = packageJson.plugins;
  if (renderedPlugins !== undefined) {
    if (
      !Array.isArray(renderedPlugins) ||
      !renderedPlugins.every((entry) => typeof entry === 'string')
    ) {
      fail('Rendered package.json "plugins" must be an array of strings.');
    }
    const packagePlugins = renderedPlugins as string[];
    assertUniqueStrings(packagePlugins, 'package.json plugin', 'rendered package.json');
    const expected = [...project.plugins].sort(compareStrings);
    const actual = [...packagePlugins].sort(compareStrings);
    if (actual.length !== expected.length || actual.some((entry, index) => entry !== expected[index])) {
      fail('Rendered package.json plugins do not match the resolved plugin list.');
    }
  } else if (project.plugins.length > 0) {
    fail('Rendered package.json is missing the resolved plugin list.');
  }
}

export function validateResolvedProject(project: ResolvedProject): void {
  const paths = new Set<string>();
  for (const file of project.files) {
    assertRelativePosixPath(file.path, 'path', 'rendered project');
    if (file.path === 'package.json') {
      fail(
        'Rendered files must not include package.json; the CLI renders package.json from fragment package data.'
      );
    }
    if (paths.has(file.path)) {
      fail(`Duplicate rendered file path "${file.path}".`);
    }
    paths.add(file.path);
    validateFileContents(file);
  }

  const capabilities = project.capabilities;
  assertUniqueStrings(capabilities, 'capability', 'resolved capabilities');
  for (const capability of capabilities) {
    if (!isCanonicalCapability(capability)) {
      fail(`Unknown capability "${capability}" in resolved capabilities.`);
    }
  }
  const expected = expectedCapabilities(project.plan.type);
  const actualSorted = [...capabilities].sort(compareStrings);
  const expectedSorted = [...expected].sort(compareStrings);
  if (
    actualSorted.length !== expectedSorted.length ||
    actualSorted.some((entry, index) => entry !== expectedSorted[index])
  ) {
    fail(
      `Resolved capabilities ${formatList(actualSorted)} do not match the "${project.plan.type}" capability set ${formatList(expectedSorted)}.`
    );
  }

  assertUniqueStrings(project.plugins, 'plugin', 'resolved plugins');

  const envKeys = new Set<string>();
  for (const line of project.env) {
    const parsed = parseEnvLine(line);
    if (!parsed) {
      fail(`Invalid resolved environment line "${line}". Expected KEY=value.`);
    }
    if (envKeys.has(parsed.key)) {
      fail(`Duplicate resolved environment key "${parsed.key}".`);
    }
    envKeys.add(parsed.key);
  }

  validatePackageJson(project);
}

function formatList(values: string[]): string {
  return values.length === 0 ? '(none)' : values.join(', ');
}
