import type { Stats } from 'node:fs';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { CliError, errorMessage } from '../errors.js';
import {
  DATABASES,
  PROJECT_TYPES,
  isDatabaseId,
  isProjectType,
  type CreatePlan,
  type DatabaseId,
  type ProjectType
} from '../types.js';
import {
  compareStrings,
  expectedCapabilities,
  isCanonicalCapability,
  isRelativePosixPath,
  parseEnvLine,
  validateFragmentPackage,
  type Capability
} from './manifest.js';
import { assertTemplatePlan } from './plan-guard.js';
import { isMissingFileError, PACKAGE_JSON_FILE } from './paths.js';
import type { FragmentPackage } from './types.js';

export const TEMPLATE_MANIFEST_FILE = 'create-stackpress.json';
export const TEMPLATE_MANIFEST_SCHEMA_VERSION = 1;

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const MAX_NAME_LENGTH = 214;
const MAX_VERSION_LENGTH = 128;
const TEMPLATE_MANIFEST_FIELDS = [
  'schemaVersion',
  'name',
  'version',
  'types',
  'databases',
  'files',
  'assets',
  'package',
  'env',
  'capabilities'
] as const;

/**
 * Optional root metadata for a custom template. Unknown fields are rejected so
 * typos cannot silently weaken compatibility checks.
 */
export type TemplateManifest = {
  schemaVersion: 1;
  name?: string;
  version?: string;
  types?: ProjectType[];
  databases?: DatabaseId[];
  files?: string[];
  assets?: string[];
  package?: FragmentPackage;
  env?: string[];
  capabilities?: Capability[];
};

function fail(message: string, hint?: string): never {
  throw CliError.generation(message, hint);
}

function usage(message: string, hint?: string): never {
  throw CliError.usage(message, hint);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describe(source: string): string {
  return source ? ` (${source})` : '';
}

function formatList(values: Iterable<string>): string {
  const sorted = [...values].sort(compareStrings);
  return sorted.length === 0 ? '(none)' : sorted.join(', ');
}

function optionalString(
  value: unknown,
  field: string,
  source: string,
  maxLength: number
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length === 0) {
    fail(
      `Template manifest${describe(source)}: "${field}" must be a non-empty string.`
    );
  }
  if (value !== value.trim()) {
    fail(
      `Template manifest${describe(source)}: "${field}" must not have leading or trailing whitespace.`
    );
  }
  if (CONTROL_CHARACTERS.test(value)) {
    fail(
      `Template manifest${describe(source)}: "${field}" contains control characters.`
    );
  }
  if (value.length > maxLength) {
    fail(
      `Template manifest${describe(source)}: "${field}" must be ${maxLength} characters or fewer.`
    );
  }
  return value;
}

function optionalProjectTypes(
  value: unknown,
  source: string
): ProjectType[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0) {
    fail(
      `Template manifest${describe(source)}: "types" must be a non-empty array of project types.`
    );
  }
  const result: ProjectType[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    if (typeof entry !== 'string' || !isProjectType(entry)) {
      fail(
        `Template manifest${describe(source)}: "types[${index}]" must be one of ${PROJECT_TYPES.join(', ')}.`
      );
    }
    if (seen.has(entry)) {
      fail(
        `Template manifest${describe(source)}: duplicate "types" entry "${entry}".`
      );
    }
    seen.add(entry);
    result.push(entry);
  }
  return result;
}

function optionalDatabases(
  value: unknown,
  source: string
): DatabaseId[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0) {
    fail(
      `Template manifest${describe(source)}: "databases" must be a non-empty array of databases.`
    );
  }
  const result: DatabaseId[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    if (typeof entry !== 'string' || !isDatabaseId(entry)) {
      fail(
        `Template manifest${describe(source)}: "databases[${index}]" must be one of ${DATABASES.join(', ')}.`
      );
    }
    if (seen.has(entry)) {
      fail(
        `Template manifest${describe(source)}: duplicate "databases" entry "${entry}".`
      );
    }
    seen.add(entry);
    result.push(entry);
  }
  return result;
}

function optionalPaths(
  value: unknown,
  field: string,
  source: string
): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    fail(
      `Template manifest${describe(source)}: "${field}" must be an array of relative paths.`
    );
  }
  const result: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    if (!isRelativePosixPath(entry)) {
      fail(
        `Template manifest${describe(source)}: "${field}[${index}]" must be a relative POSIX path without "." or ".." segments, got ${JSON.stringify(entry)}.`
      );
    }
    if (entry === PACKAGE_JSON_FILE || entry === TEMPLATE_MANIFEST_FILE) {
      fail(
        `Template manifest${describe(source)}: "${field}" must not declare "${entry}"; the CLI owns that file.`
      );
    }
    if (entry.split('/')[0] === '.git') {
      fail(
        `Template manifest${describe(source)}: "${field}" must not declare paths under ".git".`
      );
    }
    if (seen.has(entry)) {
      fail(
        `Template manifest${describe(source)}: duplicate "${field}" entry "${entry}".`
      );
    }
    seen.add(entry);
    result.push(entry);
  }
  return result;
}

function optionalEnvLines(
  value: unknown,
  source: string
): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    fail(
      `Template manifest${describe(source)}: "env" must be an array of KEY=value lines.`
    );
  }
  const keys = new Set<string>();
  const result: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    if (typeof entry !== 'string' || entry.length === 0) {
      fail(
        `Template manifest${describe(source)}: "env[${index}]" must be a non-empty string.`
      );
    }
    if (/[\r\n]/.test(entry)) {
      fail(
        `Template manifest${describe(source)}: "env[${index}]" must be a single line.`
      );
    }
    const parsed = parseEnvLine(entry);
    if (!parsed) {
      fail(
        `Template manifest${describe(source)}: invalid env entry "${entry}". Expected KEY=value.`
      );
    }
    if (keys.has(parsed.key)) {
      fail(
        `Template manifest${describe(source)}: duplicate env key "${parsed.key}".`
      );
    }
    keys.add(parsed.key);
    result.push(entry);
  }
  return result;
}

function optionalCapabilities(
  value: unknown,
  source: string
): Capability[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    fail(
      `Template manifest${describe(source)}: "capabilities" must be an array of capability names.`
    );
  }
  const result: Capability[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    if (typeof entry !== 'string' || !isCanonicalCapability(entry)) {
      fail(
        `Template manifest${describe(source)}: "capabilities[${index}]" must be a canonical capability.`
      );
    }
    if (seen.has(entry)) {
      fail(
        `Template manifest${describe(source)}: duplicate capability "${entry}".`
      );
    }
    seen.add(entry);
    result.push(entry);
  }
  return result;
}

/**
 * Validates and normalizes `create-stackpress.json`. Unknown fields are
 * errors, and every declared path must be a safe relative POSIX path.
 */
export function validateTemplateManifest(
  value: unknown,
  source: string = TEMPLATE_MANIFEST_FILE
): TemplateManifest {
  if (!isPlainObject(value)) {
    fail(`Template manifest${describe(source)}: expected an object.`);
  }
  if (value.schemaVersion !== TEMPLATE_MANIFEST_SCHEMA_VERSION) {
    fail(
      `Template manifest${describe(source)}: "schemaVersion" must be ${TEMPLATE_MANIFEST_SCHEMA_VERSION}, got ${JSON.stringify(value.schemaVersion)}.`
    );
  }
  for (const key of Object.keys(value)) {
    if (!(TEMPLATE_MANIFEST_FIELDS as readonly string[]).includes(key)) {
      fail(
        `Template manifest${describe(source)}: unknown field "${key}". Expected ${TEMPLATE_MANIFEST_FIELDS.join(', ')}.`
      );
    }
  }

  const name = optionalString(value.name, 'name', source, MAX_NAME_LENGTH);
  const version = optionalString(
    value.version,
    'version',
    source,
    MAX_VERSION_LENGTH
  );
  const types = optionalProjectTypes(value.types, source);
  const databases = optionalDatabases(value.databases, source);
  const files = optionalPaths(value.files, 'files', source);
  const assets = optionalPaths(value.assets, 'assets', source);
  if (files && assets) {
    const fileSet = new Set(files);
    for (const asset of assets) {
      if (fileSet.has(asset)) {
        fail(
          `Template manifest${describe(source)}: path "${asset}" is listed as both a file and an asset.`
        );
      }
    }
  }

  const packageData =
    value.package === undefined
      ? undefined
      : validateFragmentPackage(value.package, source);
  const env = optionalEnvLines(value.env, source);
  const capabilities = optionalCapabilities(value.capabilities, source);

  const manifest: TemplateManifest = {
    schemaVersion: TEMPLATE_MANIFEST_SCHEMA_VERSION
  };
  if (name !== undefined) manifest.name = name;
  if (version !== undefined) manifest.version = version;
  if (types !== undefined) manifest.types = types;
  if (databases !== undefined) manifest.databases = databases;
  if (files !== undefined) manifest.files = files;
  if (assets !== undefined) manifest.assets = assets;
  if (packageData !== undefined) manifest.package = packageData;
  if (env !== undefined) manifest.env = env;
  if (capabilities !== undefined) manifest.capabilities = capabilities;
  return manifest;
}

/**
 * Loads the optional template manifest from a template root.
 */
export async function loadTemplateManifest(
  root: string
): Promise<TemplateManifest | undefined> {
  const absoluteRoot = path.resolve(root);
  let rootStats;
  try {
    rootStats = await lstat(absoluteRoot);
  } catch (error) {
    if (isMissingFileError(error)) {
      fail(`Template directory was not found: ${absoluteRoot}`);
    }
    fail(
      `Unable to inspect template directory "${absoluteRoot}": ${errorMessage(error)}`
    );
  }
  if (rootStats.isSymbolicLink()) {
    fail(
      `Template directory is a symbolic link, which is not allowed: ${absoluteRoot}`
    );
  }
  if (!rootStats.isDirectory()) {
    fail(`Template path is not a directory: ${absoluteRoot}`);
  }

  const manifestPath = path.join(absoluteRoot, TEMPLATE_MANIFEST_FILE);
  let stats: Stats;
  try {
    stats = await lstat(manifestPath);
  } catch (error) {
    if (isMissingFileError(error)) return undefined;
    fail(
      `Unable to inspect template manifest "${manifestPath}": ${errorMessage(error)}`
    );
  }
  if (stats.isSymbolicLink()) {
    fail(
      `Template manifest "${manifestPath}" is a symbolic link, which is not allowed.`
    );
  }
  if (!stats.isFile()) {
    fail(`Template manifest "${manifestPath}" is not a regular file.`);
  }
  if (stats.nlink > 1) {
    fail(`Template manifest "${manifestPath}" is a hard link, which is not allowed.`);
  }

  let contents: string;
  try {
    contents = await readFile(manifestPath, 'utf8');
  } catch (error) {
    fail(
      `Unable to read template manifest "${manifestPath}": ${errorMessage(error)}`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch (error) {
    fail(
      `Template manifest "${manifestPath}" is not valid JSON: ${errorMessage(error)}`
    );
  }
  return validateTemplateManifest(parsed, manifestPath);
}

export function templateSupportsType(
  manifest: TemplateManifest,
  type: ProjectType
): boolean {
  return manifest.types === undefined || manifest.types.includes(type);
}

export function templateSupportsDatabase(
  manifest: TemplateManifest,
  database: DatabaseId
): boolean {
  return (
    manifest.databases === undefined || manifest.databases.includes(database)
  );
}

/**
 * Checks declared type, database, and capability compatibility. A manifest
 * that omits `types` or `databases` supports every value.
 */
export function assertTemplateCompatibility(
  plan: CreatePlan,
  manifest: TemplateManifest
): void {
  assertTemplatePlan(plan, 'check template compatibility');
  const label = manifest.name ?? TEMPLATE_MANIFEST_FILE;

  if (!templateSupportsType(manifest, plan.type)) {
    usage(
      `Template "${label}" does not support project type "${plan.type}". Supported types: ${formatList(manifest.types ?? [])}.`,
      'Choose a supported --type or update the template manifest.'
    );
  }
  if (!templateSupportsDatabase(manifest, plan.database)) {
    usage(
      `Template "${label}" does not support database "${plan.database}". Supported databases: ${formatList(manifest.databases ?? [])}.`,
      'Choose a supported --db or update the template manifest.'
    );
  }

  if (manifest.capabilities !== undefined) {
    const declared = new Set(manifest.capabilities);
    const required = expectedCapabilities(plan.type);
    const missing = required.filter((capability) => !declared.has(capability));
    if (missing.length > 0) {
      usage(
        `Template "${label}" declares capabilities ${formatList(manifest.capabilities)} but project type "${plan.type}" requires ${formatList(required)} (missing: ${formatList(missing)}).`,
        'Choose a supported --type or update the template manifest.'
      );
    }
  }
}

/**
 * Static templates cannot be checked against `--type` or `--db`. The CLI
 * calls this with whether each flag was explicitly supplied.
 */
export function assertStaticTemplatePlan(
  plan: CreatePlan,
  explicitType: boolean,
  explicitDatabase: boolean
): void {
  if (!explicitType && !explicitDatabase) return;

  const selected: string[] = [];
  const flags: string[] = [];
  if (explicitType) {
    flags.push('--type');
    selected.push(`--type ${plan.type}`);
  }
  if (explicitDatabase) {
    flags.push('--db');
    selected.push(`--db ${plan.database}`);
  }
  usage(
    `The template has no ${TEMPLATE_MANIFEST_FILE}, so ${selected.join(' and ')} cannot be verified.`,
    `Remove ${flags.join(' and ')} or add ${TEMPLATE_MANIFEST_FILE} to the template.`
  );
}
