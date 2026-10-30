import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { CliError, errorMessage } from '../errors.js';
import { compareStrings, isRelativePosixPath } from './manifest.js';

type TarModule = typeof import('tar');
let tarModule: Promise<TarModule> | undefined;

/**
 * Loads the archive dependency only when a remote template is actually used.
 * Core presets never pay for it at startup.
 */
function loadTar(): Promise<TarModule> {
  tarModule ??= import('tar');
  return tarModule;
}

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const MAX_RELATIVE_PATH_LENGTH = 1024;

/**
 * Hard limits applied to downloaded archives and to every template tree that
 * is read from disk. They are intentionally generous for real templates and
 * small enough to stop decompression bombs.
 */
export type ArchiveLimits = {
  maxCompressedBytes: number;
  maxExtractedBytes: number;
  maxFileCount: number;
  maxEntryCount: number;
};

export const DEFAULT_ARCHIVE_LIMITS: ArchiveLimits = {
  maxCompressedBytes: 10 * 1024 * 1024,
  maxExtractedBytes: 100 * 1024 * 1024,
  maxFileCount: 1000,
  maxEntryCount: 5000
};

export type FetchLike = (
  input: string,
  init?: RequestInit
) => Promise<Response>;

export type ArchiveStats = {
  fileCount: number;
  entryCount: number;
  extractedBytes: number;
  files: string[];
};

export type TemplateTreeEntry = {
  /** Relative POSIX path from the template root. */
  path: string;
  absolutePath: string;
  size: number;
};

export type TemplateTree = {
  files: TemplateTreeEntry[];
  directories: string[];
  fileCount: number;
  totalBytes: number;
};

export type WalkTemplateTreeOptions = {
  limits?: Partial<ArchiveLimits>;
  /**
   * Return true to skip an entry. Excluded entries are not inspected for
   * symlinks or size, so only exclude well-known repository metadata.
   */
  exclude?: (relative: string, isDirectory: boolean) => boolean;
};

export type ExtractArchiveOptions = {
  limits?: Partial<ArchiveLimits>;
  /** Number of leading path segments to strip. GitHub tarballs need 1. */
  strip?: number;
};

export type DownloadArchiveOptions = {
  fetch?: FetchLike;
  maxBytes?: number;
  signal?: AbortSignal;
};

const META_ENTRY_TYPES = new Set([
  'GlobalExtendedHeader',
  'ExtendedHeader',
  'SolarisACL',
  'NextFileHasLongLinkpath',
  'NextFileHasLongPath',
  'OldGnuLongPath',
  'TapeVolumeHeader',
  'OldExtendedHeader'
]);

const FILE_ENTRY_TYPES = new Set(['File', 'OldFile', 'ContiguousFile']);

function fail(message: string, hint?: string): never {
  throw CliError.preflight(message, hint);
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  );
}

export function resolveArchiveLimits(
  overrides: Partial<ArchiveLimits> = {}
): ArchiveLimits {
  const limits: ArchiveLimits = { ...DEFAULT_ARCHIVE_LIMITS, ...overrides };
  for (const [key, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw CliError.usage(
        `Archive limit "${key}" must be a positive integer, got ${String(value)}.`
      );
    }
  }
  return limits;
}

export type NormalizedArchiveEntry = {
  /** Normalized relative POSIX path. Empty only for the archive root. */
  path: string;
  /** True when the raw entry ended with a slash. */
  directory: boolean;
};

/**
 * Validates one tar entry name. Absolute paths, drive letters, backslashes,
 * `.`/`..` segments, empty segments, and control characters are rejected.
 */
export function normalizeArchiveEntryPath(
  raw: unknown
): NormalizedArchiveEntry {
  if (typeof raw !== 'string' || raw.length === 0) {
    fail('Template archive contains an entry with an empty path.');
  }
  if (CONTROL_CHARACTERS.test(raw)) {
    fail('Template archive contains an entry path with control characters.');
  }
  if (
    raw.startsWith('/') ||
    raw.startsWith('\\') ||
    /^[A-Za-z]:/.test(raw)
  ) {
    fail(
      `Template archive contains an absolute path, which is not allowed: ${JSON.stringify(raw)}.`
    );
  }

  const directory = raw.endsWith('/');
  const value = directory ? raw.replace(/\/+$/, '') : raw;
  if (value.length === 0) {
    return { path: '', directory };
  }
  if (!isRelativePosixPath(value)) {
    fail(
      `Template archive contains an unsafe path, which is not allowed: ${JSON.stringify(raw)}.`
    );
  }
  if (value.length > MAX_RELATIVE_PATH_LENGTH) {
    fail(
      `Template archive entry path is longer than ${MAX_RELATIVE_PATH_LENGTH} characters: ${JSON.stringify(value)}.`
    );
  }
  return { path: value, directory };
}

function assertNoFileAncestor(
  relative: string,
  files: Map<string, string>
): void {
  const segments = relative.split('/');
  for (let index = 1; index < segments.length; index += 1) {
    const ancestor = segments.slice(0, index).join('/').toLowerCase();
    const existing = files.get(ancestor);
    if (existing !== undefined) {
      fail(
        `Template archive uses "${existing}" as both a file and a directory.`
      );
    }
  }
}

function assertExtractableEntry(entry: {
  path?: unknown;
  type?: unknown;
}): NormalizedArchiveEntry | undefined {
  const type = typeof entry.type === 'string' ? entry.type : 'Unsupported';
  if (META_ENTRY_TYPES.has(type)) return undefined;

  const normalized = normalizeArchiveEntryPath(entry.path);

  if (type === 'SymbolicLink' || type === 'Link') {
    fail(
      `Template archive contains a symbolic link or hard link, which is not allowed: ${JSON.stringify(normalized.path)}.`
    );
  }
  if (type === 'CharacterDevice' || type === 'BlockDevice' || type === 'FIFO') {
    fail(
      `Template archive contains an unsupported device entry: ${JSON.stringify(normalized.path)}.`
    );
  }
  if (type === 'Directory') {
    if (normalized.path.length === 0) return normalized;
    if (!normalized.directory) {
      // tar accepts directory entries without a trailing slash; nothing to do.
      return normalized;
    }
    return normalized;
  }
  if (!FILE_ENTRY_TYPES.has(type)) {
    fail(
      `Template archive contains an unsupported entry type "${type}": ${JSON.stringify(normalized.path)}.`
    );
  }
  if (normalized.directory) {
    fail(
      `Template archive marks a file entry as a directory: ${JSON.stringify(normalized.path)}.`
    );
  }
  return normalized;
}

async function assertArchiveFile(
  archivePath: string,
  limits: ArchiveLimits
): Promise<void> {
  let stats;
  try {
    stats = await fsp.lstat(archivePath);
  } catch (error) {
    if (isMissingFileError(error)) {
      fail(`Template archive was not found: ${archivePath}`);
    }
    fail(`Unable to inspect template archive: ${errorMessage(error)}`);
  }
  if (stats.isSymbolicLink()) {
    fail(`Template archive is a symbolic link, which is not allowed: ${archivePath}`);
  }
  if (!stats.isFile()) {
    fail(`Template archive is not a regular file: ${archivePath}`);
  }
  if (stats.size > limits.maxCompressedBytes) {
    fail(
      `Template archive is ${stats.size} bytes, which exceeds the ${limits.maxCompressedBytes} byte compressed-size limit.`,
      'Use a smaller template repository or raise the limit in code.'
    );
  }
}

/**
 * Reads every archive entry without extracting and enforces path, type, size,
 * file-count, and duplicate/conflict rules.
 */
export async function inspectArchive(
  archivePath: string,
  options: Pick<ExtractArchiveOptions, 'limits'> = {}
): Promise<ArchiveStats> {
  const limits = resolveArchiveLimits(options.limits);
  await assertArchiveFile(archivePath, limits);

  const files = new Map<string, string>();
  const directories = new Set<string>();
  let entryCount = 0;
  let fileCount = 0;
  let extractedBytes = 0;
  let validationError: CliError | undefined;
  const { list: tarList } = await loadTar();

  try {
    await tarList({
      file: archivePath,
      onReadEntry: (entry) => {
        if (validationError) return;
        try {
          entryCount += 1;
          if (entryCount > limits.maxEntryCount) {
            fail(
              `Template archive contains more than ${limits.maxEntryCount} entries.`,
              'Use a smaller template repository.'
            );
          }

          const normalized = assertExtractableEntry(entry);
          if (!normalized || normalized.path.length === 0) return;

          const key = normalized.path.toLowerCase();
          if (entry.type === 'Directory') {
            if (files.has(key)) {
              fail(
                `Template archive uses "${normalized.path}" as both a file and a directory.`
              );
            }
            assertNoFileAncestor(normalized.path, files);
            directories.add(key);
            return;
          }

          const existingFile = files.get(key);
          if (existingFile !== undefined) {
            fail(
              `Template archive contains a duplicate path: ${JSON.stringify(existingFile)}.`
            );
          }
          if (directories.has(key)) {
            fail(
              `Template archive uses "${normalized.path}" as both a file and a directory.`
            );
          }
          assertNoFileAncestor(normalized.path, files);

          const size = entry.size;
          if (!Number.isSafeInteger(size) || size < 0) {
            fail(
              `Template archive entry has an invalid size: ${JSON.stringify(normalized.path)}.`
            );
          }
          fileCount += 1;
          if (fileCount > limits.maxFileCount) {
            fail(
              `Template archive contains more than ${limits.maxFileCount} files.`,
              'Use a smaller template repository.'
            );
          }
          extractedBytes += size;
          if (extractedBytes > limits.maxExtractedBytes) {
            fail(
              `Template archive expands to more than ${limits.maxExtractedBytes} bytes.`,
              'Use a smaller template repository.'
            );
          }
          files.set(key, normalized.path);
        } catch (error) {
          validationError =
            error instanceof CliError
              ? error
              : CliError.preflight(
                  `Unable to validate template archive: ${errorMessage(error)}`
                );
        }
      }
    });
  } catch (error) {
    if (error instanceof CliError) throw error;
    fail(
      `Unable to read template archive: ${errorMessage(error)}`,
      'The archive may be corrupt or may not be a gzip-compressed tarball.'
    );
  }

  if (validationError) throw validationError;
  if (entryCount === 0) {
    fail(
      'Template archive contains no entries.',
      'The archive may be corrupt or empty.'
    );
  }

  return {
    fileCount,
    entryCount,
    extractedBytes,
    files: [...files.values()].sort(compareStrings)
  };
}

/**
 * Walks a template directory without following symlinks. Rejects special
 * files, hard links, unsafe names, oversized trees, and excessive file counts.
 */
export async function walkTemplateTree(
  root: string,
  options: WalkTemplateTreeOptions = {}
): Promise<TemplateTree> {
  const limits = resolveArchiveLimits(options.limits);
  const absoluteRoot = path.resolve(root);

  let rootStats;
  try {
    rootStats = await fsp.lstat(absoluteRoot);
  } catch (error) {
    if (isMissingFileError(error)) {
      fail(`Template directory was not found: ${absoluteRoot}`);
    }
    fail(`Unable to inspect template directory: ${errorMessage(error)}`);
  }
  if (rootStats.isSymbolicLink()) {
    fail(
      `Template directory is a symbolic link, which is not allowed: ${absoluteRoot}`
    );
  }
  if (!rootStats.isDirectory()) {
    fail(`Template path is not a directory: ${absoluteRoot}`);
  }

  const files: TemplateTreeEntry[] = [];
  const directories: string[] = [];
  let entryCount = 0;
  let totalBytes = 0;

  const visit = async (relativeDirectory: string): Promise<void> => {
    const absoluteDirectory = relativeDirectory
      ? path.join(absoluteRoot, ...relativeDirectory.split('/'))
      : absoluteRoot;

    let entries;
    try {
      entries = await fsp.readdir(absoluteDirectory, { withFileTypes: true });
    } catch (error) {
      fail(
        `Unable to read template directory "${relativeDirectory || '.'}": ${errorMessage(error)}`
      );
    }
    entries.sort((left, right) => compareStrings(left.name, right.name));

    for (const dirent of entries) {
      entryCount += 1;
      if (entryCount > limits.maxEntryCount) {
        fail(
          `Template directory contains more than ${limits.maxEntryCount} entries.`
        );
      }

      const relative = relativeDirectory
        ? `${relativeDirectory}/${dirent.name}`
        : dirent.name;
      const absolute = path.join(absoluteDirectory, dirent.name);

      let stats;
      try {
        stats = await fsp.lstat(absolute);
      } catch (error) {
        fail(
          `Unable to inspect template entry "${relative}": ${errorMessage(error)}`
        );
      }

      const isDirectory = stats.isDirectory();
      if (options.exclude?.(relative, isDirectory)) continue;

      if (stats.isSymbolicLink()) {
        fail(
          `Template contains a symbolic link, which is not allowed: ${relative}`,
          'Replace the link with a regular file or directory.'
        );
      }
      if (!isRelativePosixPath(relative)) {
        fail(
          `Template contains an unsafe path, which is not allowed: ${JSON.stringify(relative)}.`
        );
      }
      if (relative.length > MAX_RELATIVE_PATH_LENGTH) {
        fail(
          `Template entry path is longer than ${MAX_RELATIVE_PATH_LENGTH} characters: ${JSON.stringify(relative)}.`
        );
      }

      if (isDirectory) {
        directories.push(relative);
        await visit(relative);
        continue;
      }

      if (!stats.isFile()) {
        fail(`Template contains an unsupported entry: ${relative}`);
      }
      if (stats.nlink > 1) {
        fail(
          `Template contains a hard link, which is not allowed: ${relative}`
        );
      }

      if (files.length + 1 > limits.maxFileCount) {
        fail(
          `Template contains more than ${limits.maxFileCount} files.`
        );
      }
      totalBytes += stats.size;
      if (totalBytes > limits.maxExtractedBytes) {
        fail(
          `Template expands to more than ${limits.maxExtractedBytes} bytes.`
        );
      }

      files.push({ path: relative, absolutePath: absolute, size: stats.size });
    }
  };

  await visit('');
  files.sort((left, right) => compareStrings(left.path, right.path));
  directories.sort(compareStrings);

  return {
    files,
    directories,
    fileCount: files.length,
    totalBytes
  };
}

/**
 * Extracts a gzip-compressed tarball after inspecting it, then verifies the
 * extracted tree against the inspected counts and sizes.
 */
export async function extractArchive(
  archivePath: string,
  destination: string,
  options: ExtractArchiveOptions = {}
): Promise<ArchiveStats> {
  const limits = resolveArchiveLimits(options.limits);
  const strip = options.strip ?? 1;
  if (!Number.isSafeInteger(strip) || strip < 0) {
    throw CliError.usage(
      `Archive strip count must be a non-negative integer, got ${String(strip)}.`
    );
  }

  const inspected = await inspectArchive(archivePath, { limits });

  await fsp.mkdir(destination, { recursive: true });
  const destinationStats = await fsp.lstat(destination);
  if (destinationStats.isSymbolicLink() || !destinationStats.isDirectory()) {
    fail(`Template extraction destination is not a directory: ${destination}`);
  }

  let filterError: CliError | undefined;
  let filterFileCount = 0;
  let filterBytes = 0;
  const { extract: tarExtract } = await loadTar();
  try {
    await tarExtract({
      file: archivePath,
      cwd: destination,
      strip,
      preservePaths: false,
      unlink: true,
      filter: (_entryPath, entry) => {
        if (filterError) return false;
        if (entry && typeof entry === 'object' && 'type' in entry) {
          try {
            const normalized = assertExtractableEntry(entry);
            // Re-check the limits while extracting so a file that changes
            // between inspection and extraction cannot exceed them.
            if (normalized && entry.type !== 'Directory') {
              filterFileCount += 1;
              if (filterFileCount > limits.maxFileCount) {
                fail(
                  `Template archive contains more than ${limits.maxFileCount} files.`,
                  'Use a smaller template repository.'
                );
              }
              const size = entry.size;
              if (!Number.isSafeInteger(size) || size < 0) {
                fail(
                  `Template archive entry has an invalid size: ${JSON.stringify(normalized.path)}.`
                );
              }
              filterBytes += size;
              if (filterBytes > limits.maxExtractedBytes) {
                fail(
                  `Template archive expands to more than ${limits.maxExtractedBytes} bytes.`,
                  'Use a smaller template repository.'
                );
              }
            }
          } catch (error) {
            filterError =
              error instanceof CliError
                ? error
                : CliError.preflight(
                    `Unable to validate template archive entry: ${errorMessage(error)}`
                  );
            return false;
          }
        }
        return true;
      }
    });
  } catch (error) {
    if (error instanceof CliError) throw error;
    fail(
      `Unable to extract template archive: ${errorMessage(error)}`,
      'The archive may be corrupt or may contain unsupported entries.'
    );
  }
  if (filterError) throw filterError;

  const tree = await walkTemplateTree(destination, { limits });
  if (tree.fileCount !== inspected.fileCount) {
    fail(
      `Template archive extraction produced ${tree.fileCount} files but the archive declared ${inspected.fileCount}.`
    );
  }
  if (tree.totalBytes !== inspected.extractedBytes) {
    fail(
      `Template archive extraction produced ${tree.totalBytes} bytes but the archive declared ${inspected.extractedBytes}.`
    );
  }

  return {
    fileCount: tree.fileCount,
    entryCount: inspected.entryCount,
    extractedBytes: tree.totalBytes,
    files: tree.files.map((file) => file.path)
  };
}

/**
 * Streams a URL to a file while enforcing the compressed-size limit. The
 * partial file is removed on every failure.
 */
export async function downloadToFile(
  url: string,
  destination: string,
  options: DownloadArchiveOptions = {}
): Promise<{ bytes: number }> {
  const fetchImpl = options.fetch ?? fetch;
  const maxBytes = options.maxBytes ?? DEFAULT_ARCHIVE_LIMITS.maxCompressedBytes;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw CliError.usage(
      `Download size limit must be a positive integer, got ${String(maxBytes)}.`
    );
  }

  let response: Response;
  try {
    response = await fetchImpl(url, {
      redirect: 'follow',
      headers: { 'user-agent': 'create-stackpress' },
      signal: options.signal
    });
  } catch (error) {
    fail(
      `Failed to download template from ${url}: ${errorMessage(error)}`,
      'Check the repository and network connection, then retry.'
    );
  }

  if (!response.ok) {
    fail(
      `Template download failed with HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}: ${url}`,
      'Check the repository, ref, and whether the repository is public.'
    );
  }

  const contentLength = response.headers.get('content-length');
  if (contentLength !== null) {
    const length = Number(contentLength);
    if (Number.isFinite(length) && length > maxBytes) {
      fail(
        `Template archive is ${length} bytes, which exceeds the ${maxBytes} byte compressed-size limit.`
      );
    }
  }

  if (!response.body) {
    fail(`Template download returned an empty response body: ${url}`);
  }

  let handle;
  try {
    handle = await fsp.open(destination, 'wx');
  } catch (error) {
    fail(
      `Unable to create temporary template archive: ${errorMessage(error)}`
    );
  }

  let bytes = 0;
  try {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        fail(
          `Template archive exceeds the ${maxBytes} byte compressed-size limit.`
        );
      }
      let offset = 0;
      while (offset < value.byteLength) {
        const { bytesWritten } = await handle.write(
          value,
          offset,
          value.byteLength - offset
        );
        if (!Number.isSafeInteger(bytesWritten) || bytesWritten <= 0) {
          throw new Error('Temporary template archive write made no progress.');
        }
        offset += bytesWritten;
      }
    }
  } catch (error) {
    await handle.close().catch(() => undefined);
    await fsp.rm(destination, { force: true }).catch(() => undefined);
    if (error instanceof CliError) throw error;
    fail(
      `Failed to download template from ${url}: ${errorMessage(error)}`,
      'Check the network connection, then retry.'
    );
  }

  try {
    await handle.close();
  } catch (error) {
    await fsp.rm(destination, { force: true }).catch(() => undefined);
    fail(
      `Unable to finalize temporary template archive: ${errorMessage(error)}`
    );
  }
  if (bytes === 0) {
    await fsp.rm(destination, { force: true }).catch(() => undefined);
    fail(`Template download returned an empty archive: ${url}`);
  }
  return { bytes };
}
