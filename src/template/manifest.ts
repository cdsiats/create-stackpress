import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { CliError } from '../errors.js';
import {
  DATABASES,
  PROJECT_TYPES,
  isDatabaseId,
  isProjectType,
  type DatabaseId,
  type ProjectType
} from '../types.js';
import {
  FRAGMENT_KINDS,
  TOKEN_NAMES,
  type FragmentKind,
  type FragmentManifest,
  type FragmentPackage
} from './types.js';

export const FRAGMENT_SCHEMA_VERSION = 1;
export const FRAGMENT_INDEX_SCHEMA_VERSION = 1;

export const FRAGMENT_INDEX_FILE = 'manifest.json';
export const FRAGMENT_MANIFEST_FILENAMES = [
  'fragment.json',
  'manifest.json'
] as const;

export const CAPABILITIES = [
  'views',
  'admin',
  'api',
  'auth',
  'content',
  'database'
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export const TYPE_CAPABILITIES: Record<ProjectType, readonly Capability[]> = {
  'full-stack': ['views', 'admin', 'api', 'auth', 'content', 'database'],
  'api-only': ['api', 'auth', 'database'],
  minimal: ['database'],
  'admin-only': ['admin', 'auth', 'database']
};

export type DatabaseMetadata = {
  adapter: string;
  driver: string;
  adapterVersion: string;
  driverVersion: string;
  connection: string;
};

export const DATABASE_METADATA: Record<DatabaseId, DatabaseMetadata> = {
  pglite: {
    adapter: '@stackpress/inquire-pglite',
    driver: '@electric-sql/pglite',
    adapterVersion: '0.10.8',
    driverVersion: '0.3.15',
    connection: 'stackpress/pglite'
  },
  postgres: {
    adapter: '@stackpress/inquire-pg',
    driver: 'pg',
    adapterVersion: '0.10.8',
    driverVersion: '8.16.3',
    connection: 'stackpress/pgsql'
  },
  cockroachdb: {
    adapter: '@stackpress/inquire-pg',
    driver: 'pg',
    adapterVersion: '0.10.8',
    driverVersion: '8.16.3',
    connection: 'stackpress/pgsql'
  },
  mysql: {
    adapter: '@stackpress/inquire-mysql2',
    driver: 'mysql2',
    adapterVersion: '0.10.8',
    driverVersion: '3.15.3',
    connection: 'stackpress/mysql'
  },
  sqlite: {
    adapter: '@stackpress/inquire-sqlite3',
    driver: 'better-sqlite3',
    adapterVersion: '0.10.8',
    driverVersion: '12.4.1',
    connection: 'stackpress/sqlite'
  }
};

export type FragmentIndexEntry = {
  id: string;
  kind: FragmentKind;
  path: string;
};

export type FragmentIndex = {
  schemaVersion: 1;
  fragments: FragmentIndexEntry[];
};

const FRAGMENT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PACKAGE_NAME_PATTERN =
  /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/;
const SCRIPT_NAME_PATTERN = /^[A-Za-z0-9:_-]+$/;
const ENV_LINE_PATTERN = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const PACKAGE_FIELDS = [
  'dependencies',
  'devDependencies',
  'scripts',
  'plugins'
] as const;

function fail(message: string, hint?: string): never {
  throw CliError.generation(message, hint);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  );
}

function describe(source: string): string {
  return source ? ` (${source})` : '';
}

function requireString(
  value: unknown,
  field: string,
  source: string
): string {
  if (typeof value !== 'string' || value.length === 0) {
    fail(`Template manifest${describe(source)}: "${field}" must be a non-empty string.`);
  }
  if (CONTROL_CHARACTERS.test(value)) {
    fail(`Template manifest${describe(source)}: "${field}" contains control characters.`);
  }
  return value;
}

export function isCanonicalCapability(value: string): value is Capability {
  return (CAPABILITIES as readonly string[]).includes(value);
}

export function isRelativePosixPath(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value.length === 0) return false;
  if (value !== value.trim()) return false;
  if (value.includes('\\')) return false;
  if (value.startsWith('/')) return false;
  if (/^[A-Za-z]:/.test(value)) return false;
  if (value.endsWith('/')) return false;
  if (CONTROL_CHARACTERS.test(value)) return false;
  const segments = value.split('/');
  return segments.every(
    (segment) =>
      segment.length > 0 &&
      segment !== '.' &&
      segment !== '..' &&
      !segment.includes(':')
  );
}

export function assertRelativePosixPath(
  value: unknown,
  field: string,
  source: string
): asserts value is string {
  if (!isRelativePosixPath(value)) {
    fail(
      `Template manifest${describe(source)}: "${field}" must be a relative POSIX path without "." or ".." segments, got ${JSON.stringify(value)}.`
    );
  }
}

function validateFragmentId(value: unknown, field: string, source: string): string {
  const id = requireString(value, field, source);
  if (id.length > 80 || !FRAGMENT_ID_PATTERN.test(id)) {
    fail(
      `Template manifest${describe(source)}: "${field}" must be a lowercase kebab-case identifier, got "${id}".`
    );
  }
  return id;
}

function validateFragmentKind(
  value: unknown,
  field: string,
  source: string
): FragmentKind {
  const kind = requireString(value, field, source);
  if (!(FRAGMENT_KINDS as readonly string[]).includes(kind)) {
    fail(
      `Template manifest${describe(source)}: "${field}" must be one of ${FRAGMENT_KINDS.join(', ')}, got "${kind}".`
    );
  }
  return kind as FragmentKind;
}

function optionalStringArray(
  value: unknown,
  field: string,
  source: string
): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    fail(`Template manifest${describe(source)}: "${field}" must be an array of strings.`);
  }
  return value.map((entry, index) => {
    if (typeof entry !== 'string' || entry.length === 0) {
      fail(
        `Template manifest${describe(source)}: "${field}[${index}]" must be a non-empty string.`
      );
    }
    if (CONTROL_CHARACTERS.test(entry)) {
      fail(
        `Template manifest${describe(source)}: "${field}[${index}]" contains control characters.`
      );
    }
    return entry;
  });
}

function assertUnique(values: string[], field: string, source: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      fail(`Template manifest${describe(source)}: duplicate "${field}" entry "${value}".`);
    }
    seen.add(value);
  }
}

function validatePathArray(
  value: unknown,
  field: string,
  source: string
): string[] | undefined {
  const paths = optionalStringArray(value, field, source);
  if (!paths) return undefined;
  paths.forEach((entry, index) => {
    assertRelativePosixPath(entry, `${field}[${index}]`, source);
  });
  assertUnique(paths, field, source);
  return paths;
}

function validateCapabilities(
  value: unknown,
  source: string
): string[] | undefined {
  const capabilities = optionalStringArray(value, 'capabilities', source);
  if (!capabilities) return undefined;
  const seen = new Set<string>();
  for (const capability of capabilities) {
    if (!isCanonicalCapability(capability)) {
      fail(
        `Template manifest${describe(source)}: unknown capability "${capability}". Expected one of ${CAPABILITIES.join(', ')}.`
      );
    }
    if (seen.has(capability)) {
      fail(`Template manifest${describe(source)}: duplicate capability "${capability}".`);
    }
    seen.add(capability);
  }
  return capabilities;
}

function validateEnvLines(value: unknown, source: string): string[] | undefined {
  const lines = optionalStringArray(value, 'env', source);
  if (!lines) return undefined;
  const keys = new Set<string>();
  for (const line of lines) {
    if (/[\r\n]/.test(line)) {
      fail(`Template manifest${describe(source)}: "env" entries must be single lines.`);
    }
    const parsed = parseEnvLine(line);
    if (!parsed) {
      fail(
        `Template manifest${describe(source)}: invalid env entry "${line}". Expected KEY=value.`
      );
    }
    if (keys.has(parsed.key)) {
      fail(`Template manifest${describe(source)}: duplicate env key "${parsed.key}".`);
    }
    keys.add(parsed.key);
  }
  return lines;
}

export function parseEnvLine(line: string): { key: string; value: string } | undefined {
  const match = ENV_LINE_PATTERN.exec(line);
  if (!match) return undefined;
  const key = match[1];
  const value = match[2];
  if (key === undefined || value === undefined) return undefined;
  return { key, value };
}

function validatePackageName(
  value: unknown,
  field: string,
  source: string
): string {
  const name = requireString(value, field, source);
  if (name.length > 214 || !PACKAGE_NAME_PATTERN.test(name)) {
    fail(
      `Template manifest${describe(source)}: "${field}" is not a valid package name, got "${name}".`
    );
  }
  return name;
}

function validateVersion(
  value: unknown,
  field: string,
  source: string
): string {
  const version = requireString(value, field, source);
  if (version !== version.trim()) {
    fail(
      `Template manifest${describe(source)}: "${field}" must not have leading or trailing whitespace.`
    );
  }
  return version;
}

function validateDependencyMap(
  value: unknown,
  field: string,
  source: string
): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) {
    fail(`Template manifest${describe(source)}: "${field}" must be an object.`);
  }
  const dependencies: Record<string, string> = {};
  for (const key of Object.keys(value)) {
    validatePackageName(key, `${field} key`, source);
    const version = validateVersion(value[key], `${field}["${key}"]`, source);
    Object.defineProperty(dependencies, key, {
      value: version,
      enumerable: true,
      configurable: true,
      writable: true
    });
  }
  return dependencies;
}

function validateScripts(
  value: unknown,
  source: string
): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) {
    fail(`Template manifest${describe(source)}: "package.scripts" must be an object.`);
  }
  const scripts: Record<string, string> = {};
  for (const key of Object.keys(value)) {
    if (!SCRIPT_NAME_PATTERN.test(key)) {
      fail(
        `Template manifest${describe(source)}: invalid script name "${key}".`
      );
    }
    const command = requireString(value[key], `package.scripts["${key}"]`, source);
    if (/[\r\n]/.test(command)) {
      fail(
        `Template manifest${describe(source)}: "package.scripts["${key}"]" must be a single line.`
      );
    }
    Object.defineProperty(scripts, key, {
      value: command,
      enumerable: true,
      configurable: true,
      writable: true
    });
  }
  return scripts;
}

export function validateFragmentPackage(
  value: unknown,
  source = 'fragment manifest'
): FragmentPackage {
  if (!isPlainObject(value)) {
    fail(`Template manifest${describe(source)}: "package" must be an object.`);
  }
  for (const key of Object.keys(value)) {
    if (!(PACKAGE_FIELDS as readonly string[]).includes(key)) {
      fail(
        `Template manifest${describe(source)}: unknown package field "${key}". Expected ${PACKAGE_FIELDS.join(', ')}.`
      );
    }
  }
  const dependencies = validateDependencyMap(
    value.dependencies,
    'package.dependencies',
    source
  );
  const devDependencies = validateDependencyMap(
    value.devDependencies,
    'package.devDependencies',
    source
  );
  const scripts = validateScripts(value.scripts, source);
  const plugins = optionalStringArray(value.plugins, 'package.plugins', source);
  if (plugins) {
    for (const plugin of plugins) {
      if (plugin !== plugin.trim()) {
        fail(
          `Template manifest${describe(source)}: "package.plugins" entries must not have leading or trailing whitespace.`
        );
      }
    }
  }

  const result: FragmentPackage = {};
  if (dependencies) result.dependencies = dependencies;
  if (devDependencies) result.devDependencies = devDependencies;
  if (scripts) result.scripts = scripts;
  if (plugins) result.plugins = plugins;
  return result;
}

export function validateFragmentManifest(
  value: unknown,
  source = 'fragment manifest'
): FragmentManifest {
  if (!isPlainObject(value)) {
    fail(`Template manifest${describe(source)}: expected an object.`);
  }
  if (value.schemaVersion !== FRAGMENT_SCHEMA_VERSION) {
    fail(
      `Template manifest${describe(source)}: "schemaVersion" must be ${FRAGMENT_SCHEMA_VERSION}, got ${JSON.stringify(value.schemaVersion)}.`
    );
  }

  const id = validateFragmentId(value.id, 'id', source);
  const kind = validateFragmentKind(value.kind, 'kind', source);

  const requires = optionalStringArray(value.requires, 'requires', source);
  if (requires) {
    requires.forEach((entry, index) => {
      validateFragmentId(entry, `requires[${index}]`, source);
    });
    assertUnique(requires, 'requires', source);
  }

  const capabilities = validateCapabilities(value.capabilities, source);
  const files = validatePathArray(value.files, 'files', source);
  const assets = validatePathArray(value.assets, 'assets', source);
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
  const env = validateEnvLines(value.env, source);

  const manifest: FragmentManifest = { schemaVersion: 1, id, kind };
  if (requires) manifest.requires = requires;
  if (capabilities) manifest.capabilities = capabilities;
  if (files) manifest.files = files;
  if (assets) manifest.assets = assets;
  if (packageData) manifest.package = packageData;
  if (env) manifest.env = env;
  return manifest;
}

export function validateFragmentIndex(
  value: unknown,
  source = 'fragment index'
): FragmentIndex {
  if (!isPlainObject(value)) {
    fail(`Template fragment index${describe(source)}: expected an object.`);
  }
  if (value.schemaVersion !== FRAGMENT_INDEX_SCHEMA_VERSION) {
    fail(
      `Template fragment index${describe(source)}: "schemaVersion" must be ${FRAGMENT_INDEX_SCHEMA_VERSION}, got ${JSON.stringify(value.schemaVersion)}.`
    );
  }
  if (!Array.isArray(value.fragments) || value.fragments.length === 0) {
    fail(
      `Template fragment index${describe(source)}: "fragments" must be a non-empty array.`
    );
  }

  const ids = new Set<string>();
  const paths = new Set<string>();
  const fragments = value.fragments.map((entry, index) => {
    if (!isPlainObject(entry)) {
      fail(`Template fragment index${describe(source)}: "fragments[${index}]" must be an object.`);
    }
    const id = validateFragmentId(entry.id, `fragments[${index}].id`, source);
    const kind = validateFragmentKind(
      entry.kind,
      `fragments[${index}].kind`,
      source
    );
    assertRelativePosixPath(
      entry.path,
      `fragments[${index}].path`,
      source
    );
    if (ids.has(id)) {
      fail(`Template fragment index${describe(source)}: duplicate fragment id "${id}".`);
    }
    if (paths.has(entry.path)) {
      fail(
        `Template fragment index${describe(source)}: duplicate fragment path "${entry.path}".`
      );
    }
    ids.add(id);
    paths.add(entry.path);
    return { id, kind, path: entry.path };
  });

  return { schemaVersion: 1, fragments };
}

export async function loadFragmentIndex(
  templateRoot: string
): Promise<FragmentIndex | undefined> {
  const file = path.join(templateRoot, FRAGMENT_INDEX_FILE);
  let stats;
  try {
    stats = await lstat(file);
  } catch (error) {
    if (isMissingFileError(error)) return undefined;
    throw CliError.generation(
      `Unable to inspect template fragment index "${file}": ${errorText(error)}`
    );
  }
  if (stats.isSymbolicLink()) {
    fail(`Template fragment index "${file}" is a symbolic link, which is not allowed.`);
  }
  if (!stats.isFile()) {
    fail(`Template fragment index "${file}" is not a file.`);
  }
  if (stats.nlink > 1) {
    fail(`Template fragment index "${file}" is a hard link, which is not allowed.`);
  }

  let contents: string;
  try {
    contents = await readFile(file, 'utf8');
  } catch (error) {
    throw CliError.generation(
      `Unable to read template fragment index "${file}": ${errorText(error)}`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch (error) {
    throw CliError.generation(
      `Template fragment index "${file}" is not valid JSON: ${errorText(error)}`
    );
  }
  return validateFragmentIndex(parsed, file);
}

export async function loadFragmentManifest(
  fragmentDir: string
): Promise<FragmentManifest> {
  for (const name of FRAGMENT_MANIFEST_FILENAMES) {
    const file = path.join(fragmentDir, name);
    let stats;
    try {
      stats = await lstat(file);
    } catch (error) {
      if (isMissingFileError(error)) continue;
      throw CliError.generation(
        `Unable to inspect fragment manifest "${file}": ${errorText(error)}`
      );
    }
    if (stats.isSymbolicLink()) {
      fail(`Fragment manifest "${file}" is a symbolic link, which is not allowed.`);
    }
    if (!stats.isFile()) continue;
    if (stats.nlink > 1) {
      fail(`Fragment manifest "${file}" is a hard link, which is not allowed.`);
    }

    let contents: string;
    try {
      contents = await readFile(file, 'utf8');
    } catch (error) {
      throw CliError.generation(
        `Unable to read fragment manifest "${file}": ${errorText(error)}`
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(contents);
    } catch (error) {
      throw CliError.generation(
        `Fragment manifest "${file}" is not valid JSON: ${errorText(error)}`
      );
    }
    return validateFragmentManifest(parsed, file);
  }

  return fail(
    `No fragment manifest found in "${fragmentDir}" (expected ${FRAGMENT_MANIFEST_FILENAMES.join(' or ')}).`
  );
}

export function canonicalFragmentIndex(): FragmentIndex {
  const fragments: FragmentIndexEntry[] = [
    { id: 'base', kind: 'base', path: 'base' }
  ];
  for (const type of PROJECT_TYPES) {
    fragments.push({ id: type, kind: 'type', path: `types/${type}` });
  }
  for (const database of DATABASES) {
    fragments.push({
      id: `database-${database}`,
      kind: 'database',
      path: `databases/${database}`
    });
  }
  return { schemaVersion: 1, fragments };
}

export function expectedCapabilities(type: ProjectType): Capability[] {
  if (!isProjectType(type)) {
    throw CliError.usage(
      `Unknown project type "${String(type)}". Expected one of ${PROJECT_TYPES.join(', ')}.`
    );
  }
  return [...TYPE_CAPABILITIES[type]];
}

export function sortCapabilities(capabilities: Iterable<string>): Capability[] {
  const values = new Set(capabilities);
  return CAPABILITIES.filter((capability) => values.has(capability));
}

export function getDatabaseMetadata(database: DatabaseId): DatabaseMetadata {
  if (!isDatabaseId(database)) {
    throw CliError.usage(
      `Unknown database "${String(database)}". Expected one of ${DATABASES.join(', ')}.`
    );
  }
  return DATABASE_METADATA[database];
}

export function isTokenName(value: string): value is (typeof TOKEN_NAMES)[number] {
  return (TOKEN_NAMES as readonly string[]).includes(value);
}

export function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function sortRecord(
  values: Record<string, string>
): Record<string, string> {
  const sorted: Record<string, string> = {};
  for (const key of Object.keys(values).sort(compareStrings)) {
    const value = values[key];
    if (value === undefined) continue;
    Object.defineProperty(sorted, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true
    });
  }
  return sorted;
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
