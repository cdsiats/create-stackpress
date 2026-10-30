import type { Stats } from 'node:fs';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { CliError, errorMessage } from '../errors.js';
import type { CreatePlan } from '../types.js';
import {
  compareStrings,
  expectedCapabilities,
  getDatabaseMetadata,
  isRelativePosixPath,
  sortCapabilities,
  validateFragmentPackage
} from './manifest.js';
import { mergePackageFragments, renderPackageJson } from './package.js';
import type {
  FragmentPackage,
  ResolvedFile,
  ResolvedProject,
  TemplateTokens
} from './types.js';
import {
  assertNoUnresolvedTokens,
  renderTokens,
  validateResolvedProject
} from './validate.js';
import { mergeEnvironment, parseEnvSample } from './environment.js';
import { walkTemplateTree } from './archive.js';
import {
  TEMPLATE_MANIFEST_FILE,
  type TemplateManifest
} from './custom-manifest.js';
import {
  ENV_SAMPLE_FILE,
  isMissingFileError,
  normalizeNewlines,
  PACKAGE_JSON_FILE,
  renderOutputPath
} from './paths.js';
import type { PreparedTemplate } from './source.js';

const PACKAGE_FIELDS = [
  'dependencies',
  'devDependencies',
  'scripts',
  'plugins'
] as const;

function fail(message: string, hint?: string): never {
  throw CliError.generation(message, hint);
}

function tokensForPlan(plan: CreatePlan): TemplateTokens {
  const metadata = getDatabaseMetadata(plan.database);
  return {
    name: plan.packageName,
    type: plan.type,
    database: plan.database,
    adapter: metadata.adapter,
    driver: metadata.driver
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readTemplateFile(
  root: string,
  relative: string,
  label: string
): Promise<Uint8Array> {
  if (!isRelativePosixPath(relative)) {
    fail(
      `Template ${label} path ${JSON.stringify(relative)} is not a safe relative POSIX path.`
    );
  }

  const rootPath = path.resolve(root);
  let current = rootPath;
  let stats: Stats | undefined;
  const segments = relative.split('/');
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (segment === undefined) continue;
    current = path.join(current, segment);
    try {
      stats = await lstat(current);
    } catch (error) {
      if (isMissingFileError(error)) {
        fail(`Template ${label} was not found: ${JSON.stringify(relative)}.`);
      }
      fail(
        `Unable to inspect template ${label} ${JSON.stringify(relative)}: ${errorMessage(error)}`
      );
    }
    if (stats.isSymbolicLink()) {
      fail(
        `Template ${label} ${JSON.stringify(relative)} contains a symbolic link at "${segment}", which is not allowed.`
      );
    }
    if (index < segments.length - 1) {
      if (!stats.isDirectory()) {
        fail(
          `Template ${label} path component "${segment}" is not a directory.`
        );
      }
    } else {
      if (!stats.isFile()) {
        fail(`Template ${label} is not a regular file: ${JSON.stringify(relative)}.`);
      }
      if (stats.nlink > 1) {
        fail(
          `Template ${label} ${JSON.stringify(relative)} is a hard link, which is not allowed.`
        );
      }
    }
  }

  return readFile(current);
}

async function readOptionalTemplatePackageJson(
  root: string,
  label: string
): Promise<Record<string, unknown> | undefined> {
  const absolute = path.join(root, PACKAGE_JSON_FILE);
  let stats: Stats;
  try {
    stats = await lstat(absolute);
  } catch (error) {
    if (isMissingFileError(error)) return undefined;
    fail(
      `Unable to inspect template ${label}: ${errorMessage(error)}`
    );
  }
  if (stats.isSymbolicLink()) {
    fail(
      `Template ${label} is a symbolic link, which is not allowed.`
    );
  }
  if (!stats.isFile()) {
    fail(`Template ${label} is not a regular file.`);
  }
  if (stats.nlink > 1) {
    fail(`Template ${label} is a hard link, which is not allowed.`);
  }

  let contents: string;
  try {
    contents = await readFile(absolute, 'utf8');
  } catch (error) {
    fail(`Unable to read template ${label}: ${errorMessage(error)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch (error) {
    fail(`Template ${label} is not valid JSON: ${errorMessage(error)}`);
  }
  if (!isPlainObject(parsed)) {
    fail(`Template ${label} must contain a JSON object.`);
  }
  return parsed;
}

function fragmentPackageFromJson(
  parsed: Record<string, unknown>,
  source: string
): FragmentPackage | undefined {
  const subset: Record<string, unknown> = {};
  for (const field of PACKAGE_FIELDS) {
    if (parsed[field] !== undefined) subset[field] = parsed[field];
  }
  if (Object.keys(subset).length === 0) return undefined;
  return validateFragmentPackage(subset, source);
}

function sortedFiles(files: Map<string, ResolvedFile>): ResolvedFile[] {
  return [...files.values()].sort((left, right) =>
    compareStrings(left.path, right.path)
  );
}

export async function resolveManifestTemplate(
  prepared: PreparedTemplate,
  plan: CreatePlan
): Promise<ResolvedProject> {
  const manifest = prepared.manifest;
  if (!manifest) {
    fail(
      `Template ${prepared.source.display} was prepared without a ${TEMPLATE_MANIFEST_FILE}.`
    );
  }

  const tokens = tokensForPlan(plan);
  const files = new Map<string, ResolvedFile>();
  const declared: Array<{ path: string; binary: boolean }> = [
    ...(manifest.files ?? []).map((filePath) => ({
      path: filePath,
      binary: false
    })),
    ...(manifest.assets ?? []).map((filePath) => ({
      path: filePath,
      binary: true
    }))
  ];

  for (const item of declared) {
    const raw = await readTemplateFile(
      prepared.root,
      item.path,
      item.binary ? 'asset' : 'file'
    );
    const outputPath = renderOutputPath(item.path);
    if (outputPath === PACKAGE_JSON_FILE) {
      fail(
        `Template declares "${PACKAGE_JSON_FILE}" as a file. Use the template package.json or the manifest package data instead.`
      );
    }
    if (files.has(outputPath)) {
      fail(
        `Template produces duplicate file "${outputPath}" from "${item.path}".`
      );
    }

    let contents: string | Uint8Array;
    if (item.binary) {
      contents = new Uint8Array(raw);
    } else {
      const text = normalizeNewlines(Buffer.from(raw).toString('utf8'));
      const rendered = renderTokens(text, tokens);
      assertNoUnresolvedTokens(rendered, outputPath);
      contents = rendered;
    }

    files.set(outputPath, {
      path: outputPath,
      contents,
      binary: item.binary,
      fragmentId: TEMPLATE_MANIFEST_FILE
    });
  }

  const packageJsonSource = await readOptionalTemplatePackageJson(
    prepared.root,
    PACKAGE_JSON_FILE
  );
  const basePackage =
    packageJsonSource === undefined
      ? undefined
      : fragmentPackageFromJson(packageJsonSource, PACKAGE_JSON_FILE);
  const mergedPackage = mergePackageFragments([
    { id: PACKAGE_JSON_FILE, package: basePackage },
    { id: TEMPLATE_MANIFEST_FILE, package: manifest.package }
  ]);
  const packageJson = renderPackageJson(plan, mergedPackage, tokens);
  const env = mergeEnvironment({
    entries: (manifest.env ?? []).map((line) => ({
      line,
      owner: TEMPLATE_MANIFEST_FILE
    })),
    files,
    tokens,
    fallbackFragmentId: TEMPLATE_MANIFEST_FILE
  });
  const plugins = Array.isArray(packageJson.plugins)
    ? packageJson.plugins.filter(
        (plugin): plugin is string => typeof plugin === 'string'
      )
    : [];
  const capabilities = sortCapabilities(expectedCapabilities(plan.type));
  const resolvedFiles = sortedFiles(files).filter(
    (file) => !(plan.noAgentsMd && file.path === 'AGENTS.md')
  );

  const project: ResolvedProject = {
    plan,
    files: resolvedFiles,
    packageJson,
    capabilities,
    env,
    plugins,
    warnings: [...prepared.warnings]
  };
  validateResolvedProject(project);
  return project;
}

function assertStringMap(value: unknown, field: string): void {
  if (value === undefined) return;
  if (!isPlainObject(value)) {
    fail(`Template ${PACKAGE_JSON_FILE}: "${field}" must be an object.`);
  }
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== 'string') {
      fail(
        `Template ${PACKAGE_JSON_FILE}: "${field}["${key}"]" must be a string.`
      );
    }
  }
}

function normalizeStaticPackageJson(
  plan: CreatePlan,
  parsed: Record<string, unknown>
): Record<string, unknown> {
  const packageJson: Record<string, unknown> = { ...parsed };
  packageJson.name = plan.packageName;
  packageJson.private = true;
  packageJson.type = 'module';

  const engines = isPlainObject(parsed.engines) ? { ...parsed.engines } : {};
  engines.node = '>=22';
  packageJson.engines = engines;

  assertStringMap(packageJson.dependencies, 'dependencies');
  assertStringMap(packageJson.devDependencies, 'devDependencies');
  assertStringMap(packageJson.scripts, 'scripts');

  const plugins = packageJson.plugins;
  if (plugins !== undefined) {
    if (
      !Array.isArray(plugins) ||
      !plugins.every((plugin) => typeof plugin === 'string')
    ) {
      fail(
        `Template ${PACKAGE_JSON_FILE}: "plugins" must be an array of strings.`
      );
    }
  }

  return packageJson;
}

function staticTemplateExclude(relative: string): boolean {
  const segments = relative.split('/');
  const first = segments[0];
  if (first === '.git' || first === 'node_modules') return true;
  return segments[segments.length - 1] === '.DS_Store';
}

export async function resolveStaticTemplate(
  prepared: PreparedTemplate,
  plan: CreatePlan
): Promise<ResolvedProject> {
  const tree = await walkTemplateTree(prepared.root, {
    limits: prepared.limits,
    exclude: staticTemplateExclude
  });
  const files = new Map<string, ResolvedFile>();
  let packageJsonSource: Record<string, unknown> | undefined;
  let packageJsonFound = false;
  let envText: string | undefined;

  for (const entry of tree.files) {
    if (entry.path === TEMPLATE_MANIFEST_FILE) continue;
    if (entry.path === PACKAGE_JSON_FILE) {
      packageJsonFound = true;
      packageJsonSource = await readOptionalTemplatePackageJson(
        prepared.root,
        PACKAGE_JSON_FILE
      );
      continue;
    }

    const outputPath = renderOutputPath(entry.path);
    if (outputPath === PACKAGE_JSON_FILE) {
      fail(
        `Template file "${entry.path}" would overwrite ${PACKAGE_JSON_FILE}.`
      );
    }
    if (files.has(outputPath)) {
      fail(`Template produces duplicate file "${outputPath}".`);
    }

    const raw = await readFile(entry.absolutePath);
    if (outputPath === ENV_SAMPLE_FILE) {
      envText = Buffer.from(raw).toString('utf8');
    }
    // Static templates are copied byte-for-byte. Marking every file binary
    // preserves arbitrary text (including {{...}} in view templates) and
    // bypasses token rendering and token validation.
    files.set(outputPath, {
      path: outputPath,
      contents: new Uint8Array(raw),
      binary: true,
      fragmentId: 'template'
    });
  }

  const packageJson = normalizeStaticPackageJson(
    plan,
    packageJsonSource ?? {}
  );
  const envEntries =
    envText === undefined
      ? new Map<string, string>()
      : parseEnvSample(envText, ENV_SAMPLE_FILE);
  const env = [...envEntries.entries()]
    .sort(([left], [right]) => compareStrings(left, right))
    .map(([key, value]) => `${key}=${value}`);
  const plugins = Array.isArray(packageJson.plugins)
    ? packageJson.plugins.filter(
        (plugin): plugin is string => typeof plugin === 'string'
      )
    : [];
  const capabilities = sortCapabilities(expectedCapabilities(plan.type));
  const warnings = [...prepared.warnings];
  if (!packageJsonFound) {
    warnings.push(
      `Template has no ${PACKAGE_JSON_FILE}; generated a minimal ${PACKAGE_JSON_FILE} for the planned package name.`
    );
  }

  const project: ResolvedProject = {
    plan,
    files: sortedFiles(files),
    packageJson,
    capabilities,
    env,
    plugins,
    warnings
  };
  validateResolvedProject(project);
  return project;
}
