import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import type { InstallContext, GitContext } from '../../src/create/workflow.js';
import { CliError } from '../../src/errors.js';
import { initializeGit } from '../../src/git/index.js';
import { createOutput } from '../../src/output.js';
import { installDependencies } from '../../src/package-manager/install.js';
import type { ResolvedProject } from '../../src/template/types.js';
import type { CreatePlan, PackageManager } from '../../src/types.js';

const roots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'install-git-'));
  roots.push(root);
  return root;
}

afterEach(async () => {
  const pending = roots.splice(0);
  await Promise.all(
    pending.map((root) =>
      fsp.rm(root, { recursive: true, force: true, maxRetries: 3 })
    )
  );
});

type MemoryStream = {
  isTTY: boolean;
  write(chunk: string): boolean;
  text(): string;
};

function memoryStream(): MemoryStream {
  let buffer = '';
  return {
    isTTY: false,
    write(chunk: string) {
      buffer += chunk;
      return true;
    },
    text() {
      return buffer;
    }
  };
}

function makePlan(
  targetDir: string,
  packageManager: PackageManager = 'npm'
): CreatePlan {
  return {
    targetDir,
    packageName: 'test-app',
    type: 'minimal',
    database: 'pglite',
    packageManager,
    install: true,
    git: true,
    overwrite: false,
    dryRun: false,
    noAgentsMd: false
  };
}

function makeContext(
  targetDir: string,
  packageManager: PackageManager = 'npm'
): InstallContext & GitContext {
  const plan = makePlan(targetDir, packageManager);
  const project: ResolvedProject = {
    plan,
    files: [],
    packageJson: { name: plan.packageName },
    capabilities: ['database'],
    env: [],
    plugins: [],
    warnings: []
  };
  return {
    plan,
    project,
    targetDir,
    output: createOutput({
      stdout: memoryStream(),
      stderr: memoryStream(),
      env: {},
      noColor: true
    })
  };
}

function processEnvWithPath(...entries: string[]): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: [...entries, process.env.PATH ?? ''].filter(Boolean).join(path.delimiter)
  };
}

function gitAvailable(): boolean {
  const result = spawnSync('git', ['--version'], {
    stdio: 'ignore',
    shell: false
  });
  return result.status === 0;
}

async function isolatedGitEnv(root: string): Promise<NodeJS.ProcessEnv> {
  const globalConfig = path.join(root, 'empty-gitconfig');
  await fsp.writeFile(globalConfig, '', 'utf8');
  return {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: globalConfig,
    GIT_CONFIG_COUNT: '2',
    GIT_CONFIG_KEY_0: 'user.name',
    GIT_CONFIG_VALUE_0: 'Stackpress Test',
    GIT_CONFIG_KEY_1: 'user.email',
    GIT_CONFIG_VALUE_1: 'test@example.invalid',
    GIT_AUTHOR_NAME: 'Stackpress Test',
    GIT_AUTHOR_EMAIL: 'test@example.invalid',
    GIT_COMMITTER_NAME: 'Stackpress Test',
    GIT_COMMITTER_EMAIL: 'test@example.invalid',
    GIT_TERMINAL_PROMPT: '0'
  };
}

/**
 * Writes a fake package-manager executable into `binDir`. On Windows the shim
 * is a `.cmd` file (which proves the `shell: true` path); elsewhere it is a
 * POSIX shell script run with `shell: false`.
 */
async function writeFakeExecutable(
  binDir: string,
  name: string,
  options: { exitCode?: number; logPath?: string; output?: string } = {}
): Promise<void> {
  const exitCode = options.exitCode ?? 0;
  if (process.platform === 'win32') {
    const lines = ['@echo off'];
    if (options.logPath) {
      lines.push(`echo %* > "${options.logPath}"`);
    }
    if (options.output) {
      lines.push(`echo ${options.output}`);
    }
    lines.push(`exit /b ${exitCode}`, '');
    await fsp.writeFile(path.join(binDir, `${name}.cmd`), lines.join('\r\n'));
    return;
  }

  const lines = ['#!/bin/sh'];
  if (options.logPath) {
    lines.push(`printf '%s\\n' "$*" > "${options.logPath}"`);
  }
  if (options.output) {
    lines.push(`printf '%s\\n' '${options.output}'`);
  }
  lines.push(`exit ${exitCode}`, '');
  const file = path.join(binDir, name);
  await fsp.writeFile(file, lines.join('\n'), { mode: 0o755 });
  await fsp.chmod(file, 0o755);
}

async function captureInstallError(
  context: InstallContext,
  options: Parameters<typeof installDependencies>[1] = {}
): Promise<CliError> {
  try {
    await installDependencies(context, options);
  } catch (error) {
    assert.ok(error instanceof CliError, 'expected a CliError');
    return error;
  }
  assert.fail('Expected the install to fail.');
}

test('runs the selected package manager install with fake executables', async () => {
  const root = await tempRoot();
  const target = path.join(root, 'app');
  const bin = path.join(root, 'bin');
  const log = path.join(root, 'install-args.txt');
  await fsp.mkdir(target);
  await fsp.mkdir(bin);
  await fsp.writeFile(
    path.join(target, 'package.json'),
    '{"name":"test-app","private":true}\n'
  );
  await writeFakeExecutable(bin, 'npm', { logPath: log });

  const context = makeContext(target);
  const outcome = await installDependencies(context, {
    env: processEnvWithPath(bin)
  });

  assert.deepEqual(outcome, { installed: true });
  assert.equal((await fsp.readFile(log, 'utf8')).trim(), 'install');
  assert.ok(existsSync(path.join(target, 'package.json')));
});

test('reports a nonzero install with the command, retry hint, and kept project', async () => {
  const root = await tempRoot();
  const target = path.join(root, 'app');
  const bin = path.join(root, 'bin');
  await fsp.mkdir(target);
  await fsp.mkdir(bin);
  await fsp.writeFile(
    path.join(target, 'package.json'),
    '{"name":"test-app","private":true}\n'
  );
  await writeFakeExecutable(bin, 'npm', { exitCode: 7 });

  const context = makeContext(target);
  const error = await captureInstallError(context, {
    env: processEnvWithPath(bin)
  });

  assert.equal(error.code, 'INSTALL');
  assert.equal(error.exitCode, 1);
  assert.match(error.message, /npm install/);
  assert.match(error.message, /exited with code 7/);
  assert.match(error.hint ?? '', new RegExp(target.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')));
  assert.match(error.hint ?? '', /Retry with/);
  assert.ok(existsSync(path.join(target, 'package.json')));
});

test('does not include package-manager output in failures', async () => {
  const root = await tempRoot();
  const target = path.join(root, 'app');
  const bin = path.join(root, 'bin');
  const secret = 's3cr3t-token-from-package-manager';
  await fsp.mkdir(target);
  await fsp.mkdir(bin);
  await fsp.writeFile(
    path.join(target, 'package.json'),
    '{"name":"test-app","private":true}\n'
  );
  await writeFakeExecutable(bin, 'npm', { exitCode: 7, output: secret });

  const context = makeContext(target);
  const error = await captureInstallError(context, {
    env: processEnvWithPath(bin)
  });

  assert.equal(error.code, 'INSTALL');
  assert.doesNotMatch(error.message, new RegExp(secret));
  assert.doesNotMatch(error.hint ?? '', new RegExp(secret));
});

test('reports a missing package-manager executable without deleting the project', async () => {
  const root = await tempRoot();
  const target = path.join(root, 'app');
  const emptyBin = path.join(root, 'empty-bin');
  await fsp.mkdir(target);
  await fsp.mkdir(emptyBin);
  await fsp.writeFile(
    path.join(target, 'package.json'),
    '{"name":"test-app","private":true}\n'
  );

  const context = makeContext(target);
  const error = await captureInstallError(context, {
    env: { ...process.env, PATH: emptyBin }
  });

  assert.equal(error.code, 'INSTALL');
  assert.equal(error.exitCode, 1);
  assert.match(error.message, /npm/i);
  assert.match(error.message, /install/i);
  assert.match(error.hint ?? '', /The project was created at/);
  assert.ok(existsSync(path.join(target, 'package.json')));
});

test('runs a real offline npm install in a tiny package', async () => {
  const root = await tempRoot();
  const target = path.join(root, 'tiny-app');
  await fsp.mkdir(target);
  await fsp.writeFile(
    path.join(target, 'package.json'),
    `${JSON.stringify(
      {
        name: 'tiny-offline-package',
        version: '1.0.0',
        private: true
      },
      null,
      2
    )}\n`,
    'utf8'
  );

  const context = makeContext(target, 'npm');
  const outcome = await installDependencies(context, {
    env: {
      ...process.env,
      npm_config_cache: path.join(root, 'npm-cache'),
      npm_config_offline: 'true',
      npm_config_audit: 'false',
      npm_config_fund: 'false',
      npm_config_update_notifier: 'false'
    },
    extraArgs: ['--ignore-scripts', '--no-audit', '--no-fund']
  });

  assert.deepEqual(outcome, { installed: true });
  assert.ok(existsSync(path.join(target, 'package.json')));
  assert.ok(existsSync(path.join(target, 'package-lock.json')));
});

test(
  'runs real git init, add, and commit with an isolated identity',
  { skip: !gitAvailable() },
  async () => {
    const root = await tempRoot();
    const target = path.join(root, 'app');
    await fsp.mkdir(target);
    await fsp.writeFile(path.join(target, 'README.md'), '# test-app\n');
    const env = await isolatedGitEnv(root);

    const context = makeContext(target);
    const outcome = await initializeGit(context, { env });

    assert.equal(outcome.initialized, true);
    assert.deepEqual(outcome.warnings, []);
    assert.ok(existsSync(path.join(target, '.git')));

    const log = spawnSync('git', ['log', '-1', '--pretty=%s'], {
      cwd: target,
      env,
      encoding: 'utf8',
      shell: false
    });
    assert.equal(log.status, 0, log.stderr);
    assert.equal(log.stdout.trim(), 'Initial commit');

    const status = spawnSync('git', ['status', '--porcelain'], {
      cwd: target,
      env,
      encoding: 'utf8',
      shell: false
    });
    assert.equal(status.status, 0, status.stderr);
    assert.equal(status.stdout.trim(), '');
  }
);

test(
  'skips git init inside an existing worktree and does not nest a repository',
  { skip: !gitAvailable() },
  async () => {
    const root = await tempRoot();
    const init = spawnSync('git', ['init'], {
      cwd: root,
      env: process.env,
      encoding: 'utf8',
      shell: false
    });
    assert.equal(init.status, 0, init.stderr);

    const target = path.join(root, 'nested-app');
    await fsp.mkdir(target);
    await fsp.writeFile(path.join(target, 'README.md'), '# nested-app\n');
    const env = await isolatedGitEnv(root);

    const context = makeContext(target);
    const outcome = await initializeGit(context, { env });

    assert.equal(outcome.initialized, true);
    assert.equal(outcome.warnings?.length, 1);
    assert.match(outcome.warnings?.[0] ?? '', /already inside a git worktree/);
    assert.equal(existsSync(path.join(target, '.git')), false);
    assert.ok(existsSync(path.join(root, '.git')));
    assert.ok(existsSync(path.join(target, 'README.md')));
  }
);

test(
  'missing git returns a warning and keeps the project',
  { skip: !gitAvailable() },
  async () => {
    const root = await tempRoot();
    const target = path.join(root, 'app');
    const emptyBin = path.join(root, 'empty-bin');
    await fsp.mkdir(target);
    await fsp.mkdir(emptyBin);
    await fsp.writeFile(path.join(target, 'README.md'), '# app\n');

    const context = makeContext(target);
    const outcome = await initializeGit(context, {
      env: { ...process.env, PATH: emptyBin }
    });

    assert.equal(outcome.initialized, false);
    assert.equal(outcome.warnings?.length, 1);
    assert.match(outcome.warnings?.[0] ?? '', /git was not found/);
    assert.ok(existsSync(path.join(target, 'README.md')));
  }
);

test(
  'a failing git step returns a warning instead of deleting the project',
  { skip: !gitAvailable() },
  async () => {
    const root = await tempRoot();
    const target = path.join(root, 'app');
    await fsp.mkdir(target);
    await fsp.writeFile(path.join(target, 'README.md'), '# app\n');
    const env = {
      ...(await isolatedGitEnv(root)),
      GIT_INDEX_FILE: path.join(root, 'missing-index-dir', 'index')
    };

    const context = makeContext(target);
    const outcome = await initializeGit(context, { env });

    assert.equal(outcome.initialized, false);
    assert.equal(outcome.warnings?.length, 1);
    assert.match(outcome.warnings?.[0] ?? '', /git add \./);
    assert.ok(existsSync(path.join(target, 'README.md')));
    assert.ok(existsSync(path.join(target, '.git')));
  }
);
