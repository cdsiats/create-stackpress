import { randomBytes } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import fs from 'node:fs';
import path from 'node:path';
import { CliError, errorMessage } from '../errors.js';
import type {
  ResolvedFile,
  ResolvedProject,
  WriteOptions,
  WriteResult
} from './types.js';

const STAGING_PREFIX = '.create-stackpress-';
const BACKUP_PREFIX = '.create-stackpress-backup-';
const EMPTY_BACKUP_PREFIX = '.create-stackpress-empty-';
const IGNORED_TARGET_ENTRIES = new Set(['.DS_Store']);

/**
 * Deterministic seams used by integration tests to simulate filesystem
 * failures and to observe the write sequence. Production callers do not need
 * to provide any of these.
 */
export type WriteHooks = {
  beforeWriteFile?(
    destination: string,
    file: ResolvedFile
  ): Promise<void> | void;
  afterStaging?(stagingDir: string): Promise<void> | void;
  /** Simulates another process creating a missing parent directory. */
  beforeCreateDirectory?(directory: string): Promise<void> | void;
  beforeBackup?(
    source: string,
    destination: string
  ): Promise<void> | void;
  beforeCopyFile?(
    source: string,
    destination: string
  ): Promise<void> | void;
  beforeRename?(
    source: string,
    destination: string
  ): Promise<void> | void;
};

/**
 * Registers synchronous cleanup for SIGINT/SIGTERM and returns an unregister
 * function. Tests substitute this to exercise cleanup without signalling the
 * test runner.
 */
export type WriteInterruptRegistrar = (cleanup: () => void) => () => void;

export type WriteContext = {
  /** Resolves relative targets and identifies the `.` target in tests. */
  cwd?: string;
  registerInterruptCleanup?: WriteInterruptRegistrar;
  hooks?: WriteHooks;
};

type TargetInspection = {
  exists: boolean;
  empty: boolean;
};

type StagedTree = {
  directories: string[];
  files: string[];
};

type WriteState = {
  targetDir: string;
  stagingDir: string | null;
  backupDir: string | null;
  emptyTargetBackup: string | null;
  createdFiles: string[];
  createdDirs: string[];
  createdParentDirs: string[];
  backupEntries: string[];
  targetCommitted: boolean;
  cleaned: boolean;
  warnings: string[];
};

function hasErrorCode(error: unknown, ...codes: string[]): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = (error as NodeJS.ErrnoException).code;
  return typeof code === 'string' && codes.includes(code);
}

function isMissingError(error: unknown): boolean {
  return hasErrorCode(error, 'ENOENT', 'ENOTDIR');
}

async function lstatOrNull(targetPath: string) {
  try {
    return await fsp.lstat(targetPath);
  } catch (error) {
    if (isMissingError(error)) return null;
    throw error;
  }
}

async function inspectTarget(targetDir: string): Promise<TargetInspection> {
  let stats;
  try {
    stats = await fsp.lstat(targetDir);
  } catch (error) {
    if (isMissingError(error)) return { exists: false, empty: true };
    throw CliError.preflight(
      `Cannot inspect target directory: ${targetDir}`,
      errorMessage(error)
    );
  }

  if (stats.isSymbolicLink()) {
    throw CliError.preflight(
      `Target is a symbolic link: ${targetDir}`,
      'Choose a real directory instead of a symlink.'
    );
  }

  if (!stats.isDirectory()) {
    throw CliError.preflight(
      `Target is not a directory: ${targetDir}`,
      'Choose a directory path or remove the existing file.'
    );
  }

  let entries: string[];
  try {
    entries = await fsp.readdir(targetDir);
  } catch (error) {
    throw CliError.preflight(
      `Cannot read target directory: ${targetDir}`,
      errorMessage(error)
    );
  }

  return {
    exists: true,
    empty: entries.every((entry) => IGNORED_TARGET_ENTRIES.has(entry))
  };
}

async function ensureDirectoryChain(
  directory: string,
  created: string[],
  hooks: WriteHooks | undefined
): Promise<void> {
  const resolved = path.resolve(directory);
  const missing: string[] = [];
  let current = resolved;

  for (;;) {
    try {
      const stats = await fsp.stat(current);
      if (!stats.isDirectory()) {
        throw CliError.preflight(
          `Cannot create target directory: ${resolved}`,
          `${current} is not a directory.`
        );
      }
      break;
    } catch (error) {
      if (hasErrorCode(error, 'ENOENT')) {
        missing.push(current);
        const parent = path.dirname(current);
        if (parent === current) throw error;
        current = parent;
        continue;
      }
      if (hasErrorCode(error, 'ENOTDIR')) {
        throw CliError.preflight(
          `Cannot create target directory: ${resolved}`,
          'A parent path is not a directory.'
        );
      }
      throw error;
    }
  }

  for (const dir of missing.reverse()) {
    await hooks?.beforeCreateDirectory?.(dir);
    try {
      await fsp.mkdir(dir);
      created.push(dir);
    } catch (error) {
      // Another process may have created a shared parent while this create
      // was running. That is not a failure; only track directories we created
      // so cleanup never removes a directory owned by someone else.
      if (!hasErrorCode(error, 'EEXIST')) throw error;
      const stats = await fsp.stat(dir).catch(() => null);
      if (!stats || !stats.isDirectory()) {
        throw CliError.preflight(
          `Cannot create target directory: ${resolved}`,
          `${dir} is not a directory.`
        );
      }
    }
  }
}

function normalizeStagedPath(rawPath: string): string {
  if (typeof rawPath !== 'string' || rawPath.trim() === '') {
    throw CliError.generation('Resolved file path is empty.');
  }
  if (rawPath.includes('\0')) {
    throw CliError.generation(`Unsafe template file path: ${rawPath}`);
  }
  if (
    path.isAbsolute(rawPath) ||
    path.win32.isAbsolute(rawPath) ||
    /^[a-zA-Z]:/.test(rawPath)
  ) {
    throw CliError.generation(
      `Absolute template file paths are not allowed: ${rawPath}`
    );
  }

  const segments = rawPath.split(/[\\/]+/);
  if (segments.some((segment) => segment === '..')) {
    throw CliError.generation(
      `Template file path escapes the target directory: ${rawPath}`
    );
  }

  const normalized = path.normalize(rawPath);
  if (normalized === '.' || normalized === '..' || normalized === '') {
    throw CliError.generation(`Invalid template file path: ${rawPath}`);
  }

  return normalized;
}

function resolveInside(root: string, rawPath: string): string {
  const destination = path.resolve(root, normalizeStagedPath(rawPath));
  const relative = path.relative(root, destination);
  if (
    relative === '' ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw CliError.generation(
      `Template file path escapes the target directory: ${rawPath}`
    );
  }
  return destination;
}

async function writeStagedFiles(
  stagingDir: string,
  project: ResolvedProject,
  hooks: WriteHooks | undefined
): Promise<void> {
  const seen = new Set<string>();
  const packagePath = path.join(stagingDir, 'package.json');
  const packageContents = `${JSON.stringify(project.packageJson, null, 2)}\n`;
  const packageFile: ResolvedFile = {
    path: 'package.json',
    contents: packageContents,
    binary: false,
    fragmentId: 'package.json'
  };

  await hooks?.beforeWriteFile?.(packagePath, packageFile);
  await fsp.writeFile(packagePath, packageContents, { flag: 'wx' });
  seen.add('package.json');

  for (const file of project.files) {
    if (
      typeof file.contents !== 'string' &&
      !(file.contents instanceof Uint8Array)
    ) {
      throw CliError.generation(
        `Invalid contents for template file: ${file.path}`
      );
    }

    const relative = normalizeStagedPath(file.path);
    if (relative === 'package.json') {
      throw CliError.generation(
        'Resolved files must not include package.json; it is rendered from project.packageJson.'
      );
    }

    const key = process.platform === 'win32' ? relative.toLowerCase() : relative;
    if (seen.has(key)) {
      throw CliError.generation(`Duplicate staged file: ${relative}`);
    }
    seen.add(key);

    const destination = resolveInside(stagingDir, relative);
    await hooks?.beforeWriteFile?.(destination, file);
    await fsp.mkdir(path.dirname(destination), { recursive: true });

    try {
      await fsp.writeFile(destination, file.contents, { flag: 'wx' });
    } catch (error) {
      if (hasErrorCode(error, 'EEXIST')) {
        throw CliError.generation(`Duplicate staged file: ${relative}`);
      }
      throw error;
    }
  }
}

async function collectStagedTree(root: string): Promise<StagedTree> {
  const directories: string[] = [];
  const files: string[] = [];

  const visit = async (relative: string): Promise<void> => {
    const absolute = relative ? path.join(root, relative) : root;
    const stats = await fsp.lstat(absolute);

    if (stats.isSymbolicLink()) {
      throw CliError.generation(
        `Staged output contains a symbolic link: ${relative}`
      );
    }

    if (stats.isDirectory()) {
      if (relative) directories.push(relative);
      const entries = await fsp.readdir(absolute);
      entries.sort();
      for (const entry of entries) {
        await visit(relative ? path.join(relative, entry) : entry);
      }
      return;
    }

    if (stats.isFile()) {
      files.push(relative);
      return;
    }

    throw CliError.generation(`Unsupported staged entry: ${relative}`);
  };

  await visit('');
  return { directories, files };
}

function pathDepth(relative: string): number {
  return relative.split(path.sep).length;
}

async function findConflicts(
  targetDir: string,
  tree: StagedTree
): Promise<string[]> {
  const conflicts = new Set<string>();
  const entries = [
    ...tree.directories.map((relative) => ({
      relative,
      directory: true
    })),
    ...tree.files.map((relative) => ({ relative, directory: false }))
  ];

  for (const entry of entries) {
    const segments = entry.relative.split(path.sep);
    for (let index = 1; index <= segments.length; index += 1) {
      const partial = segments.slice(0, index).join(path.sep);
      const stats = await lstatOrNull(path.join(targetDir, partial));
      if (!stats) break;

      const isLast = index === segments.length;
      const isDirectory = stats.isDirectory() && !stats.isSymbolicLink();

      if (isLast) {
        if (entry.directory) {
          if (!isDirectory) conflicts.add(partial);
        } else if (isDirectory) {
          throw CliError.generation(
            `Cannot overwrite directory with a file: ${partial}`,
            'Remove the conflicting directory or choose a different target.'
          );
        } else {
          conflicts.add(partial);
        }
        break;
      }

      if (!isDirectory) {
        conflicts.add(partial);
        break;
      }
    }
  }

  return [...conflicts].sort((left, right) => (
    pathDepth(left) - pathDepth(right) || left.localeCompare(right)
  ));
}

async function allocateSiblingPath(
  parentDir: string,
  prefix: string
): Promise<string> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = path.join(
      parentDir,
      `${prefix}${randomBytes(6).toString('hex')}`
    );
    if (!(await lstatOrNull(candidate))) return candidate;
  }
  throw CliError.generation(
    'Could not allocate a temporary directory beside the target.'
  );
}

async function commitReplace(
  state: WriteState,
  stagingDir: string,
  inspection: TargetInspection,
  hooks: WriteHooks | undefined
): Promise<void> {
  if (inspection.exists) {
    const emptyBackup = await allocateSiblingPath(
      path.dirname(state.targetDir),
      EMPTY_BACKUP_PREFIX
    );
    state.emptyTargetBackup = emptyBackup;
    await fsp.rename(state.targetDir, emptyBackup);
  }

  await hooks?.beforeRename?.(stagingDir, state.targetDir);
  await fsp.rename(stagingDir, state.targetDir);
  state.stagingDir = null;
  state.targetCommitted = true;
}

async function commitCopy(
  state: WriteState,
  stagingDir: string,
  hooks: WriteHooks | undefined
): Promise<void> {
  const tree = await collectStagedTree(stagingDir);
  const conflicts = await findConflicts(state.targetDir, tree);

  if (conflicts.length > 0) {
    const backupDir = await fsp.mkdtemp(
      path.join(path.dirname(state.targetDir), BACKUP_PREFIX)
    );
    state.backupDir = backupDir;

    for (const relative of conflicts) {
      const source = path.join(state.targetDir, relative);
      const destination = path.join(backupDir, relative);
      await hooks?.beforeBackup?.(source, destination);
      await fsp.mkdir(path.dirname(destination), { recursive: true });
      state.backupEntries.push(relative);
      await fsp.rename(source, destination);
    }
  }

  for (const relative of tree.directories) {
    const destination = path.join(state.targetDir, relative);
    const stats = await lstatOrNull(destination);
    if (stats) {
      if (stats.isDirectory() && !stats.isSymbolicLink()) continue;
      throw CliError.generation(
        `Cannot create directory over an existing path: ${relative}`,
        'Remove the conflicting path or choose a different target.'
      );
    }
    await fsp.mkdir(destination);
    state.createdDirs.push(destination);
  }

  for (const relative of tree.files) {
    const source = path.join(stagingDir, relative);
    const destination = path.join(state.targetDir, relative);
    await hooks?.beforeCopyFile?.(source, destination);
    state.createdFiles.push(destination);
    await fsp.copyFile(source, destination);
  }

  state.targetCommitted = true;
}

function cleanupStateSync(state: WriteState): string[] {
  if (state.cleaned) return [];
  state.cleaned = true;

  const errors: string[] = [];
  const attempt = (label: string, action: () => void): void => {
    try {
      action();
    } catch (error) {
      if (!isMissingError(error)) {
        errors.push(`${label}: ${errorMessage(error)}`);
      }
    }
  };

  if (!state.targetCommitted) {
    for (const file of [...state.createdFiles].reverse()) {
      attempt(`remove ${file}`, () => {
        fs.rmSync(file, { recursive: true, force: true });
      });
    }

    for (const dir of [...state.createdDirs].reverse()) {
      attempt(`remove ${dir}`, () => {
        fs.rmdirSync(dir);
      });
    }

    if (state.backupDir) {
      for (const relative of [...state.backupEntries].reverse()) {
        const backupPath = path.join(state.backupDir, relative);
        const destination = path.join(state.targetDir, relative);
        attempt(`restore ${destination}`, () => {
          // When the original was never moved, it is still in place. Never
          // remove it while restoring.
          if (fs.existsSync(destination)) return;
          fs.mkdirSync(path.dirname(destination), { recursive: true });
          fs.renameSync(backupPath, destination);
        });
      }
    }

    if (state.emptyTargetBackup) {
      attempt(`restore ${state.targetDir}`, () => {
        if (fs.existsSync(state.targetDir)) return;
        fs.renameSync(state.emptyTargetBackup as string, state.targetDir);
        state.emptyTargetBackup = null;
      });
    }
  }

  if (state.stagingDir) {
    attempt('remove staging directory', () => {
      fs.rmSync(state.stagingDir as string, {
        recursive: true,
        force: true
      });
    });
    state.stagingDir = null;
  }

  if (state.backupDir) {
    attempt('remove backup directory', () => {
      fs.rmSync(state.backupDir as string, {
        recursive: true,
        force: true
      });
    });
    state.backupDir = null;
  }

  if (state.emptyTargetBackup) {
    attempt('remove empty target backup', () => {
      fs.rmSync(state.emptyTargetBackup as string, {
        recursive: true,
        force: true
      });
    });
    state.emptyTargetBackup = null;
  }

  if (!state.targetCommitted) {
    for (const dir of [...state.createdParentDirs].reverse()) {
      attempt(`remove ${dir}`, () => {
        fs.rmdirSync(dir);
      });
    }
  }

  return errors;
}

function registerProcessInterruptCleanup(cleanup: () => void): () => void {
  let active = true;

  const handleSignal = (): void => {
    if (!active) return;
    active = false;
    try {
      cleanup();
    } finally {
      process.off('SIGINT', handleSignal);
      process.off('SIGTERM', handleSignal);
      process.exit(130);
    }
  };

  process.on('SIGINT', handleSignal);
  process.on('SIGTERM', handleSignal);

  return () => {
    if (!active) return;
    active = false;
    process.off('SIGINT', handleSignal);
    process.off('SIGTERM', handleSignal);
  };
}

function toWriteError(error: unknown, cleanupErrors: string[]): CliError {
  if (error instanceof CliError) return error;

  const hint = cleanupErrors.length > 0
    ? `Cleanup was incomplete (${cleanupErrors.join('; ')}). Review the target before retrying.`
    : 'The target was not changed.';

  return CliError.generation(
    `Failed to write project: ${errorMessage(error)}`,
    hint
  );
}

/**
 * Writes a resolved project into a sibling staging directory, validates it,
 * then commits it to the target with backup and rollback protection.
 */
export async function writeProject(
  project: ResolvedProject,
  options: WriteOptions,
  context: WriteContext = {}
): Promise<WriteResult> {
  if (typeof options.targetDir !== 'string' || options.targetDir.trim() === '') {
    throw CliError.preflight(
      'Target directory is required.',
      'Pass a project directory, for example: create-stackpress my-app'
    );
  }

  const cwd = path.resolve(context.cwd ?? process.cwd());
  const targetDir = path.resolve(cwd, options.targetDir);
  const isCurrentDirectory = targetDir === cwd;
  const inspection = await inspectTarget(targetDir);

  if (inspection.exists && !inspection.empty && !options.overwrite) {
    throw CliError.preflight(
      `Target directory is not empty: ${targetDir}`,
      'Choose an empty directory or pass --overwrite to replace conflicting files.'
    );
  }

  const state: WriteState = {
    targetDir,
    stagingDir: null,
    backupDir: null,
    emptyTargetBackup: null,
    createdFiles: [],
    createdDirs: [],
    createdParentDirs: [],
    backupEntries: [],
    targetCommitted: false,
    cleaned: false,
    warnings: []
  };

  const register = context.registerInterruptCleanup ??
    registerProcessInterruptCleanup;
  let unregister: (() => void) | null = null;

  try {
    unregister = register(() => {
      cleanupStateSync(state);
    });

    await ensureDirectoryChain(
      path.dirname(targetDir),
      state.createdParentDirs,
      context.hooks
    );

    const stagingDir = await fsp.mkdtemp(
      path.join(path.dirname(targetDir), STAGING_PREFIX)
    );
    state.stagingDir = stagingDir;

    await writeStagedFiles(stagingDir, project, context.hooks);
    await context.hooks?.afterStaging?.(stagingDir);

    if (options.validate) {
      await options.validate(stagingDir);
    }

    const useCopy = isCurrentDirectory || (inspection.exists && !inspection.empty);
    if (useCopy) {
      await commitCopy(state, stagingDir, context.hooks);
    } else {
      await commitReplace(state, stagingDir, inspection, context.hooks);
    }
  } catch (error) {
    const cleanupErrors = cleanupStateSync(state);
    if (unregister) unregister();
    throw toWriteError(error, cleanupErrors);
  }

  const cleanupErrors = cleanupStateSync(state);
  if (unregister) unregister();
  if (cleanupErrors.length > 0) {
    state.warnings.push(
      `Temporary files could not be fully removed: ${cleanupErrors.join('; ')}`
    );
  }

  return {
    targetDir,
    warnings: [...project.warnings, ...state.warnings]
  };
}
