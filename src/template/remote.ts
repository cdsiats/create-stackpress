import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CliError, errorMessage } from '../errors.js';
import {
  downloadToFile,
  extractArchive,
  resolveArchiveLimits,
  type ArchiveLimits,
  type ArchiveStats,
  type FetchLike
} from './archive.js';
import type { GitHubTemplateSource } from './source.js';

export type FetchGitHubTemplateOptions = {
  fetch?: FetchLike;
  /** Parent directory for the temporary workspace. Defaults to os.tmpdir(). */
  tempRoot?: string;
  limits?: Partial<ArchiveLimits>;
};

export type FetchedGitHubTemplate = {
  root: string;
  cleanup: () => Promise<void>;
  stats: ArchiveStats;
  tarballUrl: string;
  ref: string;
};

const GITHUB_OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const GITHUB_REPO_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;
const REF_PATTERN = /^[A-Za-z0-9._/-]{1,255}$/;

function fail(message: string, hint?: string): never {
  throw CliError.preflight(message, hint);
}

function encodeRef(ref: string): string {
  return ref
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

/**
 * Builds the codeload tarball URL. The default ref is HEAD, which resolves to
 * the repository's default branch.
 */
export function githubTarballUrl(
  owner: string,
  repo: string,
  ref: string = 'HEAD'
): string {
  if (!GITHUB_OWNER_PATTERN.test(owner)) {
    throw CliError.usage(
      `Invalid GitHub owner "${owner}". Expected letters, digits, and hyphens.`
    );
  }
  if (!GITHUB_REPO_PATTERN.test(repo) || repo === '.' || repo === '..') {
    throw CliError.usage(
      `Invalid GitHub repository "${repo}". Expected letters, digits, ".", "_", and "-".`
    );
  }
  if (!isSafeRef(ref)) {
    throw CliError.usage(`Invalid GitHub ref "${ref}".`);
  }
  return `https://codeload.github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tar.gz/${encodeRef(ref)}`;
}

export function isSafeRef(ref: string): boolean {
  if (typeof ref !== 'string' || ref.length === 0) return false;
  if (!REF_PATTERN.test(ref)) return false;
  if (ref.startsWith('-') || ref.startsWith('/') || ref.endsWith('/')) {
    return false;
  }
  if (ref.includes('..') || ref.includes('//')) return false;
  if (ref.split('/').some((segment) => segment === '.' || segment === '..')) {
    return false;
  }
  if (ref.endsWith('.lock')) return false;
  return true;
}

/**
 * Downloads a GitHub tarball into a temporary workspace, extracts it with the
 * archive safety limits, and returns the template root plus an idempotent
 * cleanup callback. Template scripts are never executed.
 */
export async function fetchGitHubTemplate(
  source: GitHubTemplateSource,
  options: FetchGitHubTemplateOptions = {}
): Promise<FetchedGitHubTemplate> {
  const limits = resolveArchiveLimits(options.limits);
  const tempRoot = path.resolve(options.tempRoot ?? os.tmpdir());

  try {
    await fsp.mkdir(tempRoot, { recursive: true });
  } catch (error) {
    fail(
      `Unable to create temporary template directory: ${errorMessage(error)}`,
      'Check that the temporary directory is writable.'
    );
  }

  let workspace: string;
  try {
    workspace = await fsp.mkdtemp(
      path.join(tempRoot, 'create-stackpress-template-')
    );
  } catch (error) {
    fail(
      `Unable to create temporary template directory: ${errorMessage(error)}`,
      'Check that the temporary directory is writable.'
    );
  }

  const cleanup = async (): Promise<void> => {
    await fsp.rm(workspace, { recursive: true, force: true });
  };

  try {
    const tarballUrl = githubTarballUrl(
      source.owner,
      source.repo,
      source.ref ?? 'HEAD'
    );
    const archivePath = path.join(workspace, 'template.tar.gz');
    await downloadToFile(tarballUrl, archivePath, {
      fetch: options.fetch,
      maxBytes: limits.maxCompressedBytes
    });

    const root = path.join(workspace, 'template');
    await fsp.mkdir(root, { recursive: true });
    const stats = await extractArchive(archivePath, root, {
      limits,
      strip: 1
    });
    await fsp.rm(archivePath, { force: true });

    if (stats.fileCount === 0) {
      fail(
        `GitHub template ${source.display} contains no files.`,
        'Check that the repository and ref contain a template.'
      );
    }

    return {
      root,
      cleanup,
      stats,
      tarballUrl,
      ref: source.ref ?? 'HEAD'
    };
  } catch (error) {
    await cleanup().catch(() => undefined);
    if (error instanceof CliError) throw error;
    fail(
      `Failed to fetch GitHub template ${source.display}: ${errorMessage(error)}`,
      'Check the repository, ref, and network connection, then retry.'
    );
  }
}
