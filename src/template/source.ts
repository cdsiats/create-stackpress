import { statSync } from 'node:fs';
import { lstat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CliError, errorMessage } from '../errors.js';
import type { CreatePlan } from '../types.js';
import {
  resolveArchiveLimits,
  type ArchiveLimits,
  type FetchLike
} from './archive.js';
import {
  assertStaticTemplatePlan,
  assertTemplateCompatibility,
  loadTemplateManifest,
  type TemplateManifest
} from './custom-manifest.js';
import { assertTemplatePlan } from './plan-guard.js';
import { isMissingFileError } from './paths.js';
import { fetchGitHubTemplate, githubTarballUrl } from './remote.js';
import {
  resolveManifestTemplate,
  resolveStaticTemplate
} from './template-project.js';
import type { ResolvedProject } from './types.js';

export {
  TEMPLATE_MANIFEST_FILE,
  TEMPLATE_MANIFEST_SCHEMA_VERSION,
  assertStaticTemplatePlan,
  assertTemplateCompatibility,
  loadTemplateManifest,
  templateSupportsDatabase,
  templateSupportsType,
  validateTemplateManifest
} from './custom-manifest.js';
export type { TemplateManifest } from './custom-manifest.js';
export { parseEnvSample } from './environment.js';

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const GITHUB_OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const GITHUB_REPO_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;
const REF_PATTERN = /^[A-Za-z0-9._/-]{1,255}$/;

export type LocalTemplateSource = {
  kind: 'local';
  raw: string;
  path: string;
  display: string;
};

export type GitHubTemplateSource = {
  kind: 'github';
  raw: string;
  owner: string;
  repo: string;
  ref?: string;
  display: string;
  tarballUrl: string;
};

export type TemplateSource = LocalTemplateSource | GitHubTemplateSource;

export type PreparedTemplate = {
  kind: 'manifest' | 'static';
  root: string;
  manifest?: TemplateManifest;
  source: TemplateSource;
  limits: ArchiveLimits;
  warnings: string[];
  cleanup: () => Promise<void>;
};

export type PrepareTemplateOptions = {
  cwd?: string;
  fetch?: FetchLike;
  tempRoot?: string;
  limits?: Partial<ArchiveLimits>;
  /** Test seam for the local-directory check used by bare `owner/repo`. */
  isLocalDirectory?: (absolute: string) => boolean;
};

function fail(message: string, hint?: string): never {
  throw CliError.generation(message, hint);
}

function usage(message: string, hint?: string): never {
  throw CliError.usage(message, hint);
}

function splitRef(value: string): { base: string; ref?: string } {
  const index = value.indexOf('#');
  if (index === -1) return { base: value };
  const ref = value.slice(index + 1);
  return {
    base: value.slice(0, index),
    ref: ref.length > 0 ? ref : undefined
  };
}

function assertRef(ref: string, raw: string): string {
  if (
    !REF_PATTERN.test(ref) ||
    ref.startsWith('-') ||
    ref.startsWith('/') ||
    ref.endsWith('/') ||
    ref.includes('..') ||
    ref.includes('//') ||
    ref.split('/').some((segment) => segment === '.' || segment === '..') ||
    ref.endsWith('.lock')
  ) {
    usage(
      `Invalid GitHub ref "${ref}" in template source "${raw}".`,
      'Use a branch, tag, or commit with letters, digits, ".", "_", "/", and "-".'
    );
  }
  return ref;
}

function assertGitHubOwner(owner: string, raw: string): string {
  if (!GITHUB_OWNER_PATTERN.test(owner) || owner.endsWith('-')) {
    usage(
      `Invalid GitHub owner "${owner}" in template source "${raw}".`,
      'Expected a GitHub user or organization name.'
    );
  }
  return owner;
}

function normalizeRepoName(repo: string, raw: string): string {
  const value = repo.endsWith('.git') ? repo.slice(0, -4) : repo;
  if (!GITHUB_REPO_PATTERN.test(value) || value === '.' || value === '..') {
    usage(
      `Invalid GitHub repository "${repo}" in template source "${raw}".`,
      'Expected a repository name with letters, digits, ".", "_", and "-".'
    );
  }
  return value;
}

function githubSource(
  owner: string,
  repo: string,
  ref: string | undefined,
  raw: string
): GitHubTemplateSource {
  const normalizedOwner = assertGitHubOwner(owner, raw);
  const normalizedRepo = normalizeRepoName(repo, raw);
  const normalizedRef = ref === undefined ? undefined : assertRef(ref, raw);
  const display = `github:${normalizedOwner}/${normalizedRepo}${
    normalizedRef ? `#${normalizedRef}` : ''
  }`;
  return {
    kind: 'github',
    raw,
    owner: normalizedOwner,
    repo: normalizedRepo,
    ...(normalizedRef ? { ref: normalizedRef } : {}),
    display,
    tarballUrl: githubTarballUrl(
      normalizedOwner,
      normalizedRepo,
      normalizedRef ?? 'HEAD'
    )
  };
}

function localSource(value: string, raw: string): LocalTemplateSource {
  return {
    kind: 'local',
    raw,
    path: value,
    display: `local:${value}`
  };
}

function isExplicitLocalPath(value: string): boolean {
  if (value === '.' || value === '..' || value === '~') return true;
  if (
    value.startsWith('./') ||
    value.startsWith('../') ||
    value.startsWith('.\\') ||
    value.startsWith('..\\')
  ) {
    return true;
  }
  if (value.startsWith('/') || value.startsWith('\\')) return true;
  if (value.startsWith('~/') || value.startsWith('~\\')) return true;
  if (/^[A-Za-z]:[\\/]/.test(value) || /^[A-Za-z]:$/.test(value)) return true;
  return false;
}

function isGitHubShorthand(value: string): boolean {
  if (value.includes('\\')) return false;
  const segments = value.split('/');
  if (segments.length !== 2) return false;
  const owner = segments[0];
  const repo = segments[1];
  if (owner === undefined || repo === undefined) return false;
  if (!GITHUB_OWNER_PATTERN.test(owner) || owner.endsWith('-')) return false;
  const normalizedRepo = repo.endsWith('.git') ? repo.slice(0, -4) : repo;
  return (
    GITHUB_REPO_PATTERN.test(normalizedRepo) &&
    normalizedRepo !== '.' &&
    normalizedRepo !== '..'
  );
}

function defaultIsLocalDirectory(absolute: string): boolean {
  try {
    return statSync(absolute).isDirectory();
  } catch {
    return false;
  }
}

function parseGitHubUrl(raw: string): GitHubTemplateSource {
  const gitScp = /^git@github\.com:([^/]+)\/([^/#]+?)(?:\.git)?(?:#(.+))?$/i.exec(
    raw
  );
  if (gitScp) {
    const owner = gitScp[1];
    const repo = gitScp[2];
    const ref = gitScp[3];
    if (owner === undefined || repo === undefined) {
      usage('Invalid GitHub URL.', 'Use a GitHub URL, owner/repo, or a local directory.');
    }
    return githubSource(owner, repo, ref, raw);
  }

  let urlValue = raw;
  if (/^git\+/i.test(urlValue)) urlValue = urlValue.slice(4);

  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    usage(
      'Invalid template URL.',
      'Use a GitHub URL, owner/repo, or a local directory.'
    );
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:' && url.protocol !== 'ssh:') {
    usage(
      `Unsupported template URL protocol "${url.protocol}".`,
      'Use an https:// GitHub URL, owner/repo, or a local directory.'
    );
  }

  const host = url.hostname.toLowerCase();
  if (host !== 'github.com' && host !== 'www.github.com') {
    usage(
      `Unsupported template host "${url.hostname}".`,
      'Only github.com URLs are supported; use owner/repo or a local directory otherwise.'
    );
  }

  let segments: string[];
  try {
    segments = url.pathname
      .split('/')
      .filter((segment) => segment.length > 0)
      .map((segment) => decodeURIComponent(segment));
  } catch {
    usage('Invalid GitHub URL path.');
  }

  const owner = segments[0];
  const repo = segments[1];
  if (owner === undefined || repo === undefined) {
    usage(
      'GitHub URL is missing an owner or repository.',
      'Expected https://github.com/owner/repo.'
    );
  }

  let ref: string | undefined;
  const rest = segments.slice(2);
  if (rest.length > 0) {
    const [kind, ...tail] = rest;
    if (kind === 'tree') {
      if (tail.length === 0) {
        usage('GitHub tree URL is missing a ref.');
      }
      ref = tail.join('/');
    } else if (kind === 'archive') {
      let archivePath = tail.join('/');
      if (archivePath.endsWith('.tar.gz')) {
        archivePath = archivePath.slice(0, -'.tar.gz'.length);
      } else if (archivePath.endsWith('.tgz')) {
        archivePath = archivePath.slice(0, -'.tgz'.length);
      } else {
        usage(
          'Unsupported GitHub archive URL.',
          'Only .tar.gz and .tgz archives are supported.'
        );
      }
      if (archivePath.startsWith('refs/heads/')) {
        archivePath = archivePath.slice('refs/heads/'.length);
      } else if (archivePath.startsWith('refs/tags/')) {
        archivePath = archivePath.slice('refs/tags/'.length);
      }
      if (archivePath.length === 0) {
        usage('GitHub archive URL is missing a ref.');
      }
      ref = archivePath;
    } else {
      usage(
        `Unsupported GitHub URL path "${rest.join('/')}".`,
        'Use https://github.com/owner/repo, /tree/<ref>, or /archive/<ref>.tar.gz.'
      );
    }
  }

  if (url.hash.length > 1) {
    let hashRef: string;
    try {
      hashRef = decodeURIComponent(url.hash.slice(1));
    } catch {
      usage('Invalid GitHub URL fragment.');
    }
    if (ref !== undefined && ref !== hashRef) {
      usage(
        `GitHub URL specifies two different refs ("${ref}" and "${hashRef}").`,
        'Specify the ref once, with #ref or in the URL path.'
      );
    }
    ref = hashRef;
  }

  return githubSource(owner, repo, ref, raw);
}

/**
 * Parses a `--template` value into a local path or GitHub source. Bare
 * two-segment values are treated as `owner/repo` unless a matching local
 * directory exists.
 */
export function parseTemplateSource(
  rawValue: string,
  options: {
    cwd?: string;
    isLocalDirectory?: (absolute: string) => boolean;
  } = {}
): TemplateSource {
  if (typeof rawValue !== 'string') {
    usage('Template source must be a string.');
  }
  if (rawValue.length === 0) {
    usage('Template source is empty.', 'Pass --template <path|owner/repo|url>.');
  }
  if (rawValue !== rawValue.trim()) {
    usage('Template source must not have leading or trailing whitespace.');
  }
  if (CONTROL_CHARACTERS.test(rawValue)) {
    usage('Template source must not contain control characters.');
  }

  if (/^file:\/\//i.test(rawValue)) {
    let filePath: string;
    try {
      filePath = fileURLToPath(rawValue);
    } catch {
      usage(
        'Invalid file URL.',
        'Pass a local directory path instead.'
      );
    }
    return localSource(filePath, rawValue);
  }

  if (/^github:/i.test(rawValue)) {
    const value = rawValue.slice('github:'.length);
    const { base, ref } = splitRef(value);
    const segments = base.split('/');
    if (segments.length !== 2) {
      usage(
        `Invalid GitHub template "${rawValue}".`,
        'Expected github:owner/repo#ref.'
      );
    }
    const owner = segments[0];
    const repo = segments[1];
    if (owner === undefined || repo === undefined) {
      usage(`Invalid GitHub template "${rawValue}".`);
    }
    return githubSource(owner, repo, ref, rawValue);
  }

  if (/^git@/i.test(rawValue) || /^ssh:\/\//i.test(rawValue)) {
    return parseGitHubUrl(rawValue);
  }

  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(rawValue)) {
    if (!/^(?:git\+)?https?:\/\//i.test(rawValue)) {
      const match = /^([A-Za-z][A-Za-z0-9+.-]*):\/\//.exec(rawValue);
      usage(
        `Unsupported template URL protocol "${match?.[1] ?? 'unknown'}:".`,
        'Only GitHub URLs are supported.'
      );
    }
    return parseGitHubUrl(rawValue);
  }

  if (isExplicitLocalPath(rawValue)) {
    return localSource(rawValue, rawValue);
  }

  const cwd = path.resolve(options.cwd ?? process.cwd());
  const isLocal = options.isLocalDirectory ?? defaultIsLocalDirectory;
  if (isLocal(path.resolve(cwd, rawValue))) {
    return localSource(rawValue, rawValue);
  }

  const { base, ref } = splitRef(rawValue);
  if (isGitHubShorthand(base)) {
    const segments = base.split('/');
    const owner = segments[0];
    const repo = segments[1];
    if (owner !== undefined && repo !== undefined) {
      return githubSource(owner, repo, ref, rawValue);
    }
  }

  return localSource(rawValue, rawValue);
}

function expandHome(value: string): string {
  if (value === '~') return os.homedir();
  if (value.startsWith('~/') || value.startsWith('~\\')) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

/**
 * Resolves a local template path and rejects missing, non-directory, and
 * symlinked roots.
 */
export async function resolveLocalTemplateRoot(
  source: LocalTemplateSource,
  cwd: string = process.cwd()
): Promise<string> {
  const absolute = path.resolve(cwd, expandHome(source.path));
  let stats;
  try {
    stats = await lstat(absolute);
  } catch (error) {
    if (isMissingFileError(error)) {
      usage(
        `Template directory was not found: ${absolute}`,
        'Pass a path to an existing template directory.'
      );
    }
    usage(
      `Unable to inspect template directory "${absolute}": ${errorMessage(error)}`
    );
  }
  if (stats.isSymbolicLink()) {
    usage(
      `Template directory is a symbolic link, which is not allowed: ${absolute}`,
      'Pass the real directory instead.'
    );
  }
  if (!stats.isDirectory()) {
    usage(
      `Template path is not a directory: ${absolute}`,
      'Pass a directory containing the template.'
    );
  }
  return absolute;
}

/**
 * Prepares a local or GitHub template. Remote templates are fetched into a
 * temporary directory; always call `cleanup()` when finished with the result.
 */
export async function prepareTemplateSource(
  plan: CreatePlan,
  options: PrepareTemplateOptions = {}
): Promise<PreparedTemplate> {
  assertTemplatePlan(plan, 'prepare a template');
  if (typeof plan.template !== 'string' || plan.template.length === 0) {
    usage(
      'No template source was provided.',
      'Pass --template <path|owner/repo|url>.'
    );
  }

  const cwd = path.resolve(options.cwd ?? process.cwd());
  const source = parseTemplateSource(plan.template, {
    cwd,
    isLocalDirectory: options.isLocalDirectory
  });
  const limits = resolveArchiveLimits(options.limits);

  if (source.kind === 'local') {
    const root = await resolveLocalTemplateRoot(source, cwd);
    const manifest = await loadTemplateManifest(root);
    return {
      kind: manifest === undefined ? 'static' : 'manifest',
      root,
      ...(manifest === undefined ? {} : { manifest }),
      source,
      limits,
      warnings: [],
      cleanup: async () => undefined
    };
  }

  const fetched = await fetchGitHubTemplate(source, {
    fetch: options.fetch,
    tempRoot: options.tempRoot,
    limits
  });
  try {
    const manifest = await loadTemplateManifest(fetched.root);
    return {
      kind: manifest === undefined ? 'static' : 'manifest',
      root: fetched.root,
      ...(manifest === undefined ? {} : { manifest }),
      source,
      limits,
      warnings: [],
      cleanup: fetched.cleanup
    };
  } catch (error) {
    await fetched.cleanup().catch(() => undefined);
    throw error;
  }
}

/**
 * Resolves a prepared template into the writer-facing project shape.
 */
export async function resolveTemplateProject(
  prepared: PreparedTemplate,
  plan: CreatePlan
): Promise<ResolvedProject> {
  assertTemplatePlan(plan, 'resolve templates');
  if (prepared.kind === 'manifest') {
    if (!prepared.manifest) {
      fail(
        `Template ${prepared.source.display} is missing its parsed create-stackpress.json.`
      );
    }
    assertTemplateCompatibility(plan, prepared.manifest);
    return resolveManifestTemplate(prepared, plan);
  }
  return resolveStaticTemplate(prepared, plan);
}
