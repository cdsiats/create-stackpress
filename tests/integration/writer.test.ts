import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { CliError } from '../../src/errors.js';
import type {
  ResolvedFile,
  ResolvedProject
} from '../../src/template/types.js';
import {
  writeProject,
  type WriteContext,
  type WriteHooks
} from '../../src/template/write.js';
import type { CreatePlan } from '../../src/types.js';

const PLAN: CreatePlan = {
  targetDir: '.',
  packageName: 'test-app',
  type: 'full-stack',
  database: 'pglite',
  packageManager: 'npm',
  install: false,
  git: false,
  overwrite: false,
  dryRun: false,
  noAgentsMd: false
};

const roots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'writer-test-'));
  roots.push(root);
  return root;
}

afterEach(async () => {
  const pending = roots.splice(0);
  await Promise.all(
    pending.map((root) => fsp.rm(root, { recursive: true, force: true }))
  );
});

function file(
  filePath: string,
  contents: string | Uint8Array
): ResolvedFile {
  return {
    path: filePath,
    contents,
    binary: contents instanceof Uint8Array,
    fragmentId: 'test'
  };
}

function project(
  files: ResolvedFile[],
  packageJson: Record<string, unknown> = { name: 'test-app' },
  warnings: string[] = []
): ResolvedProject {
  return {
    plan: PLAN,
    files,
    packageJson,
    capabilities: [],
    env: [],
    plugins: [],
    warnings
  };
}

function packageText(packageJson: Record<string, unknown>): string {
  return `${JSON.stringify(packageJson, null, 2)}\n`;
}

async function readText(filePath: string): Promise<string> {
  return fsp.readFile(filePath, 'utf8');
}

async function captureError(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  assert.fail('Expected the write to fail.');
}

function isCliError(error: unknown, code: CliError['code']): error is CliError {
  return error instanceof CliError && error.code === code;
}

function hasCode(error: unknown, ...codes: string[]): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = (error as NodeJS.ErrnoException).code;
  return typeof code === 'string' && codes.includes(code);
}

async function temporaryEntries(directory: string): Promise<string[]> {
  return (await fsp.readdir(directory)).filter(
    (entry) => entry.startsWith('.create-stackpress-')
  );
}

async function assertNoTemporaryEntries(directory: string): Promise<void> {
  assert.deepEqual(await temporaryEntries(directory), []);
}

test('writes a missing target through a sibling staging directory', async () => {
  const root = await tempRoot();
  const target = path.join(root, 'app');
  const binary = Uint8Array.from([0, 1, 2, 255, 128]);
  const packageJson = { name: 'app', private: true, type: 'module' };

  const result = await writeProject(
    project([
      file('src/index.ts', 'export const value = 1;\n'),
      file('assets/logo.bin', binary)
    ], packageJson),
    { targetDir: target, overwrite: false }
  );

  assert.equal(result.targetDir, target);
  assert.deepEqual(result.warnings, []);
  assert.equal(
    await readText(path.join(target, 'package.json')),
    packageText(packageJson)
  );
  assert.equal(
    await readText(path.join(target, 'src', 'index.ts')),
    'export const value = 1;\n'
  );
  assert.ok(
    (await fsp.readFile(path.join(target, 'assets', 'logo.bin'))).equals(
      Buffer.from(binary)
    )
  );
  assert.deepEqual((await fsp.readdir(root)).sort(), ['app']);
});

test('tolerates a parent directory created concurrently (EEXIST)', async () => {
  const root = await tempRoot();
  const target = path.join(root, 'shared', 'nested', 'app');
  let raced = false;
  const hooks: WriteHooks = {
    async beforeCreateDirectory(directory) {
      if (raced) return;
      raced = true;
      // Simulate another create process winning the mkdir race.
      await fsp.mkdir(directory, { recursive: true });
    }
  };

  await writeProject(
    project([], { name: 'app' }),
    { targetDir: target, overwrite: false },
    { hooks }
  );

  assert.equal(raced, true);
  assert.ok(existsSync(path.join(target, 'package.json')));
  assert.deepEqual((await fsp.readdir(root)).sort(), ['shared']);
});

test('does not delete a concurrently created parent when the write fails', async () => {
  const root = await tempRoot();
  const target = path.join(root, 'shared', 'app');
  let raced = false;
  const hooks: WriteHooks = {
    async beforeCreateDirectory(directory) {
      if (raced) return;
      raced = true;
      await fsp.mkdir(directory, { recursive: true });
    },
    beforeWriteFile() {
      throw new Error('simulated staging failure');
    }
  };

  const error = await captureError(() =>
    writeProject(
      project([], { name: 'app' }),
      { targetDir: target, overwrite: false },
      { hooks }
    )
  );

  assert.ok(isCliError(error, 'GENERATION'));
  assert.equal(raced, true);
  assert.equal(existsSync(path.join(root, 'shared')), true);
  assert.equal(existsSync(target), false);
  assert.deepEqual(await temporaryEntries(root), []);
});

test('rejects a concurrently created parent that is not a directory', async () => {
  const root = await tempRoot();
  const target = path.join(root, 'shared', 'app');
  const hooks: WriteHooks = {
    async beforeCreateDirectory(directory) {
      await fsp.writeFile(directory, 'not a directory\n');
    }
  };

  const error = await captureError(() =>
    writeProject(
      project([], { name: 'app' }),
      { targetDir: target, overwrite: false },
      { hooks }
    )
  );

  assert.ok(isCliError(error, 'PREFLIGHT'));
  assert.match(error.message, /Cannot create target directory/);
  assert.equal(
    await readText(path.join(root, 'shared')),
    'not a directory\n'
  );
  assert.equal(existsSync(target), false);
  assert.deepEqual(await temporaryEntries(root), []);
});

test('writes into an existing empty target', async () => {
  const root = await tempRoot();
  const target = path.join(root, 'app');
  const packageJson = { name: 'app' };
  await fsp.mkdir(target);

  await writeProject(
    project([], packageJson),
    { targetDir: target, overwrite: false }
  );

  assert.equal(
    await readText(path.join(target, 'package.json')),
    packageText(packageJson)
  );
  assert.deepEqual((await fsp.readdir(root)).sort(), ['app']);
});

test('treats a .DS_Store-only target as empty', async () => {
  const root = await tempRoot();
  const target = path.join(root, 'app');
  const packageJson = { name: 'app' };
  await fsp.mkdir(target);
  await fsp.writeFile(path.join(target, '.DS_Store'), 'metadata');

  await writeProject(
    project([], packageJson),
    { targetDir: target, overwrite: false }
  );

  assert.equal(
    await readText(path.join(target, 'package.json')),
    packageText(packageJson)
  );
  assert.equal(existsSync(path.join(target, '.DS_Store')), false);
  assert.deepEqual((await fsp.readdir(root)).sort(), ['app']);
});

test('rejects a non-empty target without overwrite', async () => {
  const root = await tempRoot();
  const target = path.join(root, 'app');
  await fsp.mkdir(target);
  await fsp.writeFile(path.join(target, 'keep.txt'), 'keep\n');

  const error = await captureError(() => writeProject(
    project([file('src/index.ts', 'export {};\n')], { name: 'app' }),
    { targetDir: target, overwrite: false }
  ));

  assert.ok(isCliError(error, 'PREFLIGHT'));
  assert.match(error.message, /not empty/);
  assert.match(error.hint ?? '', /--overwrite/);
  assert.equal(await readText(path.join(target, 'keep.txt')), 'keep\n');
  assert.deepEqual((await fsp.readdir(target)).sort(), ['keep.txt']);
  assert.deepEqual((await fsp.readdir(root)).sort(), ['app']);
});

test('overwrite replaces conflicts and preserves unrelated files', async () => {
  const root = await tempRoot();
  const target = path.join(root, 'app');
  await fsp.mkdir(path.join(target, 'config'), { recursive: true });
  await fsp.mkdir(path.join(target, 'nested', 'deep'), { recursive: true });
  await fsp.writeFile(path.join(target, 'package.json'), '{"old":true}\n');
  await fsp.writeFile(path.join(target, 'keep.txt'), 'keep\n');
  await fsp.writeFile(
    path.join(target, 'config', 'database.ts'),
    'old database\n'
  );
  await fsp.writeFile(
    path.join(target, 'config', 'settings.json'),
    '{"unrelated":true}\n'
  );
  await fsp.writeFile(
    path.join(target, 'nested', 'deep', 'keep.md'),
    'nested\n'
  );
  // A file where the staged project needs a directory.
  await fsp.writeFile(path.join(target, 'src'), 'old file\n');
  const packageJson = {
    name: 'app',
    private: true,
    dependencies: { stackpress: '0.0.0' }
  };

  await writeProject(
    project([
      file('config/database.ts', 'new database\n'),
      file('config/capabilities.ts', 'export const caps = [];\n'),
      file('src/index.ts', 'export const value = 1;\n')
    ], packageJson),
    { targetDir: target, overwrite: true }
  );

  assert.equal(
    await readText(path.join(target, 'package.json')),
    packageText(packageJson)
  );
  assert.equal(
    await readText(path.join(target, 'config', 'database.ts')),
    'new database\n'
  );
  assert.equal(
    await readText(path.join(target, 'config', 'capabilities.ts')),
    'export const caps = [];\n'
  );
  assert.equal(
    await readText(path.join(target, 'src', 'index.ts')),
    'export const value = 1;\n'
  );
  assert.equal(await readText(path.join(target, 'keep.txt')), 'keep\n');
  assert.equal(
    await readText(path.join(target, 'config', 'settings.json')),
    '{"unrelated":true}\n'
  );
  assert.equal(
    await readText(path.join(target, 'nested', 'deep', 'keep.md')),
    'nested\n'
  );
  assert.deepEqual((await fsp.readdir(root)).sort(), ['app']);
  await assertNoTemporaryEntries(root);
});

test('rejects a regular file target', async () => {
  const root = await tempRoot();
  const target = path.join(root, 'app');
  await fsp.writeFile(target, 'not a directory');

  const error = await captureError(() => writeProject(
    project([], { name: 'app' }),
    { targetDir: target, overwrite: false }
  ));

  assert.ok(isCliError(error, 'PREFLIGHT'));
  assert.match(error.message, /not a directory/);
  assert.equal(await readText(target), 'not a directory');
  assert.deepEqual((await fsp.readdir(root)).sort(), ['app']);
});

test('rejects a symlink target', async (t) => {
  const root = await tempRoot();
  const real = path.join(root, 'real');
  const link = path.join(root, 'app');
  await fsp.mkdir(real);
  await fsp.writeFile(path.join(real, 'keep.txt'), 'keep\n');

  try {
    await fsp.symlink(real, link, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (hasCode(error, 'EPERM', 'EACCES', 'ENOSYS', 'EINVAL')) {
      t.skip('Creating symlinks is not permitted on this host.');
      return;
    }
    throw error;
  }

  const error = await captureError(() => writeProject(
    project([], { name: 'app' }),
    { targetDir: link, overwrite: false }
  ));

  assert.ok(isCliError(error, 'PREFLIGHT'));
  assert.match(error.message, /symbolic link/);
  assert.equal(await readText(path.join(real, 'keep.txt')), 'keep\n');
});

test('validates staged output before the target exists', async () => {
  const root = await tempRoot();
  const target = path.join(root, 'app');
  const packageJson = { name: 'app', private: true };
  let validated = false;
  let cleanupRegistered = false;
  let cleanupUnregistered = false;

  const context: WriteContext = {
    registerInterruptCleanup(cleanup) {
      cleanupRegistered = typeof cleanup === 'function';
      return () => {
        cleanupUnregistered = true;
      };
    }
  };

  await writeProject(
    project([file('src/index.ts', 'export {};\n')], packageJson),
    {
      targetDir: target,
      overwrite: false,
      validate: async (stagingDir) => {
        validated = true;
        assert.notEqual(stagingDir, target);
        assert.match(
          path.basename(stagingDir),
          /^\.create-stackpress-[a-zA-Z0-9]+$/
        );
        assert.equal(
          await readText(path.join(stagingDir, 'package.json')),
          packageText(packageJson)
        );
        assert.equal(
          await readText(path.join(stagingDir, 'src', 'index.ts')),
          'export {};\n'
        );
        assert.equal(existsSync(target), false);
      }
    },
    context
  );

  assert.equal(validated, true);
  assert.equal(cleanupRegistered, true);
  assert.equal(cleanupUnregistered, true);
  assert.equal(existsSync(target), true);
  assert.deepEqual((await fsp.readdir(root)).sort(), ['app']);
});

test('a validation failure leaves the target untouched', async () => {
  const root = await tempRoot();
  const target = path.join(root, 'app');
  await fsp.mkdir(target);
  await fsp.writeFile(path.join(target, 'keep.txt'), 'keep\n');

  const error = await captureError(() => writeProject(
    project([file('src/index.ts', 'export {};\n')], { name: 'app' }),
    {
      targetDir: target,
      overwrite: true,
      validate: () => {
        throw new Error('invalid rendered output');
      }
    }
  ));

  assert.ok(isCliError(error, 'GENERATION'));
  assert.match(error.message, /invalid rendered output/);
  assert.deepEqual((await fsp.readdir(target)).sort(), ['keep.txt']);
  assert.deepEqual((await fsp.readdir(root)).sort(), ['app']);
});

test('a staging write failure leaves no half-written target', async () => {
  const root = await tempRoot();
  const target = path.join(root, 'app');
  let writes = 0;

  const hooks: WriteHooks = {
    beforeWriteFile() {
      writes += 1;
      if (writes === 2) throw new Error('simulated staging failure');
    }
  };

  const error = await captureError(() => writeProject(
    project([
      file('src/index.ts', 'export const value = 1;\n'),
      file('README.md', '# app\n')
    ], { name: 'app' }),
    { targetDir: target, overwrite: false },
    { hooks }
  ));

  assert.ok(isCliError(error, 'GENERATION'));
  assert.match(error.message, /simulated staging failure/);
  assert.equal(writes, 2);
  assert.equal(existsSync(target), false);
  assert.deepEqual(await fsp.readdir(root), []);
});

test('a copy failure restores backed-up conflicts and removes new files', async () => {
  const root = await tempRoot();
  const target = path.join(root, 'app');
  await fsp.mkdir(target);
  await fsp.writeFile(path.join(target, 'package.json'), '{"old":true}\n');
  await fsp.writeFile(path.join(target, 'keep.txt'), 'keep\n');
  let copies = 0;

  const hooks: WriteHooks = {
    beforeCopyFile() {
      copies += 1;
      if (copies === 2) throw new Error('simulated copy failure');
    }
  };

  const error = await captureError(() => writeProject(
    project([
      file('a.txt', 'a\n'),
      file('b.txt', 'b\n'),
      file('c.txt', 'c\n')
    ], { name: 'app' }),
    { targetDir: target, overwrite: true },
    { hooks }
  ));

  assert.ok(isCliError(error, 'GENERATION'));
  assert.match(error.message, /simulated copy failure/);
  assert.equal(copies, 2);
  assert.equal(
    await readText(path.join(target, 'package.json')),
    '{"old":true}\n'
  );
  assert.equal(await readText(path.join(target, 'keep.txt')), 'keep\n');
  assert.deepEqual(
    (await fsp.readdir(target)).sort(),
    ['keep.txt', 'package.json']
  );
  assert.deepEqual((await fsp.readdir(root)).sort(), ['app']);
  await assertNoTemporaryEntries(root);
});

test('an empty target is restored when the final rename fails', async () => {
  const root = await tempRoot();
  const target = path.join(root, 'app');
  await fsp.mkdir(target);

  const hooks: WriteHooks = {
    beforeRename() {
      throw new Error('simulated rename failure');
    }
  };

  const error = await captureError(() => writeProject(
    project([], { name: 'app' }),
    { targetDir: target, overwrite: false },
    { hooks }
  ));

  assert.ok(isCliError(error, 'GENERATION'));
  assert.match(error.message, /simulated rename failure/);
  assert.equal(existsSync(target), true);
  assert.deepEqual(await fsp.readdir(target), []);
  assert.deepEqual((await fsp.readdir(root)).sort(), ['app']);
});

test('a missing target stays missing when the final rename fails', async () => {
  const root = await tempRoot();
  const target = path.join(root, 'app');

  const hooks: WriteHooks = {
    beforeRename() {
      throw new Error('simulated rename failure');
    }
  };

  const error = await captureError(() => writeProject(
    project([], { name: 'app' }),
    { targetDir: target, overwrite: false },
    { hooks }
  ));

  assert.ok(isCliError(error, 'GENERATION'));
  assert.match(error.message, /simulated rename failure/);
  assert.equal(existsSync(target), false);
  assert.deepEqual(await fsp.readdir(root), []);
});

test('a dot target copies into the current directory without replacing it', async () => {
  const root = await tempRoot();
  const current = path.join(root, 'current');
  await fsp.mkdir(path.join(current, 'config'), { recursive: true });
  await fsp.writeFile(path.join(current, 'package.json'), '{"old":true}\n');
  await fsp.writeFile(path.join(current, 'keep.txt'), 'keep\n');
  await fsp.writeFile(
    path.join(current, 'config', 'keep.json'),
    '{"unrelated":true}\n'
  );

  let cleanupRegistered = false;
  let cleanupUnregistered = false;
  const context: WriteContext = {
    cwd: current,
    registerInterruptCleanup() {
      cleanupRegistered = true;
      return () => {
        cleanupUnregistered = true;
      };
    }
  };

  const packageJson = { name: 'current', private: true };
  const result = await writeProject(
    project([
      file('config/database.ts', 'export const database = "pglite";\n')
    ], packageJson),
    { targetDir: '.', overwrite: true },
    context
  );

  assert.equal(result.targetDir, current);
  assert.equal(cleanupRegistered, true);
  assert.equal(cleanupUnregistered, true);
  assert.equal(
    await readText(path.join(current, 'package.json')),
    packageText(packageJson)
  );
  assert.equal(
    await readText(path.join(current, 'config', 'database.ts')),
    'export const database = "pglite";\n'
  );
  assert.equal(await readText(path.join(current, 'keep.txt')), 'keep\n');
  assert.equal(
    await readText(path.join(current, 'config', 'keep.json')),
    '{"unrelated":true}\n'
  );
  assert.deepEqual((await fsp.readdir(root)).sort(), ['current']);
  await assertNoTemporaryEntries(root);
});

test('a dot target still requires overwrite when it is non-empty', async () => {
  const root = await tempRoot();
  const current = path.join(root, 'current');
  await fsp.mkdir(current);
  await fsp.writeFile(path.join(current, 'keep.txt'), 'keep\n');

  const error = await captureError(() => writeProject(
    project([], { name: 'current' }),
    { targetDir: '.', overwrite: false },
    { cwd: current }
  ));

  assert.ok(isCliError(error, 'PREFLIGHT'));
  assert.match(error.message, /not empty/);
  assert.deepEqual((await fsp.readdir(current)).sort(), ['keep.txt']);
});

test('interrupt cleanup removes staging and restores overwritten files', async () => {
  const root = await tempRoot();
  const target = path.join(root, 'app');
  await fsp.mkdir(target);
  await fsp.writeFile(path.join(target, 'package.json'), '{"old":true}\n');
  await fsp.writeFile(path.join(target, 'keep.txt'), 'keep\n');

  let interruptCleanup: (() => void) | undefined;
  let unregistered = false;
  const context: WriteContext = {
    registerInterruptCleanup(cleanup) {
      interruptCleanup = cleanup;
      return () => {
        unregistered = true;
      };
    }
  };

  const hooks: WriteHooks = {
    beforeCopyFile() {
      assert.ok(interruptCleanup);
      interruptCleanup();
      throw new Error('simulated interrupt');
    }
  };

  const error = await captureError(() => writeProject(
    project([
      file('index.ts', 'export {};\n')
    ], { name: 'app' }),
    { targetDir: target, overwrite: true },
    { ...context, hooks }
  ));

  assert.ok(isCliError(error, 'GENERATION'));
  assert.match(error.message, /simulated interrupt/);
  assert.equal(unregistered, true);
  assert.equal(
    await readText(path.join(target, 'package.json')),
    '{"old":true}\n'
  );
  assert.equal(await readText(path.join(target, 'keep.txt')), 'keep\n');
  assert.deepEqual(
    (await fsp.readdir(target)).sort(),
    ['keep.txt', 'package.json']
  );
  assert.deepEqual((await fsp.readdir(root)).sort(), ['app']);
  await assertNoTemporaryEntries(root);
});

test('rejects template paths that escape the staging directory', async () => {
  const root = await tempRoot();
  const target = path.join(root, 'app');

  const error = await captureError(() => writeProject(
    project([file('../escape.txt', 'escaped\n')], { name: 'app' }),
    { targetDir: target, overwrite: false }
  ));

  assert.ok(isCliError(error, 'GENERATION'));
  assert.match(error.message, /escapes the target directory/);
  assert.equal(existsSync(target), false);
  assert.equal(existsSync(path.join(root, 'escape.txt')), false);
  assert.deepEqual(await fsp.readdir(root), []);
});

test('rejects absolute, drive, UNC, and traversal template paths', async () => {
  const root = await tempRoot();
  const target = path.join(root, 'app');
  const unsafePaths = [
    '/etc/passwd',
    'C:/Windows/win.ini',
    'C:\\Windows\\win.ini',
    '//server/share/file.txt',
    '\\\\server\\share\\file.txt',
    '../escape.txt',
    '..\\escape.txt',
    'config/../../escape.txt'
  ];

  for (const unsafePath of unsafePaths) {
    const error = await captureError(() =>
      writeProject(
        project([file(unsafePath, 'unsafe\n')], { name: 'app' }),
        { targetDir: target, overwrite: false }
      )
    );

    assert.ok(
      isCliError(error, 'GENERATION'),
      `expected ${JSON.stringify(unsafePath)} to be rejected`
    );
    assert.match(error.message, /Absolute|escapes the target directory/);
    assert.equal(existsSync(target), false);
    assert.equal(existsSync(path.join(root, 'escape.txt')), false);
    assert.deepEqual(await temporaryEntries(root), []);
  }
});

test('rejects a ResolvedFile that claims package.json', async () => {
  const root = await tempRoot();
  const target = path.join(root, 'app');

  const error = await captureError(() => writeProject(
    project([file('package.json', '{"name":"wrong"}\n')], { name: 'app' }),
    { targetDir: target, overwrite: false }
  ));

  assert.ok(isCliError(error, 'GENERATION'));
  assert.match(error.message, /must not include package\.json/);
  assert.equal(existsSync(target), false);
  assert.deepEqual(await fsp.readdir(root), []);
});
