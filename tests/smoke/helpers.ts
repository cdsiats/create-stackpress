import { spawnSync } from 'node:child_process';
import { existsSync, promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const DIST_CLI = path.join(REPO_ROOT, 'dist', 'cli.js');

export type CommandResult = {
  status: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  error?: Error;
};

export type CommandOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeout?: number;
};

export function runCommand(
  command: string,
  args: string[],
  options: CommandOptions = {}
): CommandResult {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? REPO_ROOT,
    env: { ...process.env, ...(options.env ?? {}) },
    encoding: 'utf8',
    windowsHide: true,
    timeout: options.timeout,
    maxBuffer: 32 * 1024 * 1024
  });

  return {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error ?? undefined
  };
}

export function describeCommandFailure(
  label: string,
  result: CommandResult
): string {
  const status = result.status === null ? 'no exit code' : `exit code ${result.status}`;
  const signal = result.signal ? `, signal ${result.signal}` : '';
  const error = result.error ? `${result.error.message}\n` : '';
  const stdout = result.stdout.trim() ? `stdout:\n${result.stdout.trim()}\n` : '';
  const stderr = result.stderr.trim() ? `stderr:\n${result.stderr.trim()}\n` : '';
  return `${label} failed (${status}${signal}).\n${error}${stdout}${stderr}`.trim();
}

let cachedNpmCli: string | undefined;

/**
 * Resolves npm's JavaScript entrypoint so tests can spawn it with `node`
 * directly. This avoids Windows `.cmd` shell quoting, which matters because
 * temporary paths commonly contain spaces.
 */
export function npmCliPath(): string {
  if (cachedNpmCli) return cachedNpmCli;

  const candidates: string[] = [];
  const fromEnvironment = process.env.npm_execpath;
  if (fromEnvironment && /\.(c|m)?js$/i.test(fromEnvironment)) {
    candidates.push(fromEnvironment);
  }
  candidates.push(
    path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.resolve(
      path.dirname(process.execPath),
      '..',
      'lib',
      'node_modules',
      'npm',
      'bin',
      'npm-cli.js'
    )
  );

  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(
      'Unable to locate npm-cli.js. Run the tests through npm (for example "npm test") or install npm next to Node.js.'
    );
  }

  cachedNpmCli = found;
  return found;
}

export function runNpm(
  args: string[],
  options: CommandOptions = {}
): CommandResult {
  return runCommand(process.execPath, [npmCliPath(), ...args], options);
}

let buildPromise: Promise<void> | undefined;

/**
 * Builds `dist/` once per test process. The CLI and package smoke tests use
 * the real built artifact, while the default test command stays network-free.
 */
export function ensureBuilt(): Promise<void> {
  buildPromise ??= (async () => {
    const result = runNpm(['run', 'build'], { timeout: 180_000 });
    if (result.status !== 0) {
      throw new Error(describeCommandFailure('npm run build', result));
    }
    if (!existsSync(DIST_CLI)) {
      throw new Error(`npm run build finished without creating ${DIST_CLI}`);
    }
  })();

  return buildPromise;
}

export function runCli(
  args: string[],
  options: CommandOptions = {}
): CommandResult {
  return runCommand(process.execPath, [DIST_CLI, ...args], {
    ...options,
    env: { CI: '1', NO_COLOR: '1', ...(options.env ?? {}) }
  });
}

export function runInstalledCli(
  packageRoot: string,
  args: string[],
  options: CommandOptions = {}
): CommandResult {
  return runCommand(
    process.execPath,
    [path.join(packageRoot, 'dist', 'cli.js'), ...args],
    {
      ...options,
      env: { CI: '1', NO_COLOR: '1', ...(options.env ?? {}) }
    }
  );
}

const roots: string[] = [];

export async function tempRoot(
  prefix = 'create-stackpress-smoke-'
): Promise<string> {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
}

export async function cleanupTempRoots(): Promise<void> {
  const pending = roots.splice(0);
  await Promise.all(
    pending.map((root) =>
      fsp.rm(root, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100
      })
    )
  );
}

export async function listFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    const entries = await fsp.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(fullPath);
      } else {
        files.push(path.relative(root, fullPath).split(path.sep).join('/'));
      }
    }
  };
  await visit(root);
  return files.sort();
}

export async function readJson(
  filePath: string
): Promise<Record<string, any>> {
  return JSON.parse(await fsp.readFile(filePath, 'utf8')) as Record<string, any>;
}

export async function temporaryEntries(directory: string): Promise<string[]> {
  const entries = await fsp.readdir(directory);
  return entries.filter((entry) => entry.startsWith('.create-stackpress-'));
}
