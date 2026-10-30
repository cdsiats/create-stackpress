import assert from 'node:assert/strict';
import { existsSync, promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { type TestContext } from 'node:test';
import { create as tarCreate } from 'tar';
import { CliError, type CliErrorCode } from '../../src/errors.js';
import type { CreatePlan } from '../../src/types.js';
import {
  extractArchive,
  inspectArchive,
  type FetchLike
} from '../../src/template/archive.js';
import {
  prepareTemplateSource,
  resolveTemplateProject
} from '../../src/template/source.js';
import { validateResolvedProject } from '../../src/template/validate.js';
import { writeProject } from '../../src/template/write.js';

const fixtureRoot = fileURLToPath(
  new URL('../fixtures/templates', import.meta.url)
);

function createPlan(overrides: Partial<CreatePlan> = {}): CreatePlan {
  return {
    targetDir: path.join(os.tmpdir(), 'stackpress-remote-app'),
    packageName: 'stackpress-remote-app',
    type: 'api-only',
    database: 'pglite',
    packageManager: 'npm',
    install: false,
    git: false,
    overwrite: false,
    dryRun: false,
    noAgentsMd: false,
    ...overrides
  };
}

async function tempDir(t: TestContext): Promise<string> {
  const directory = await fsp.mkdtemp(
    path.join(os.tmpdir(), 'stackpress-remote-test-')
  );
  t.after(async () => {
    await fsp.rm(directory, { recursive: true, force: true });
  });
  return directory;
}

async function assertCliAsync(
  action: Promise<unknown>,
  code: CliErrorCode,
  pattern?: RegExp
): Promise<void> {
  await assert.rejects(action, (error: unknown) => {
    assert.ok(error instanceof CliError);
    assert.equal(error.code, code);
    if (pattern) assert.match(error.message, pattern);
    return true;
  });
}

async function listFiles(root: string): Promise<string[]> {
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

async function readJson(
  filePath: string
): Promise<Record<string, unknown>> {
  return JSON.parse(await fsp.readFile(filePath, 'utf8')) as Record<
    string,
    unknown
  >;
}

function textFile(
  project: Awaited<ReturnType<typeof resolveTemplateProject>>,
  filePath: string
): string {
  const file = project.files.find((candidate) => candidate.path === filePath);
  assert.ok(file, `expected ${filePath} in resolved files`);
  assert.equal(file.binary, false);
  return file.contents as string;
}

function bytesFile(
  project: Awaited<ReturnType<typeof resolveTemplateProject>>,
  filePath: string
): Buffer {
  const file = project.files.find((candidate) => candidate.path === filePath);
  assert.ok(file, `expected ${filePath} in resolved files`);
  assert.equal(file.binary, true);
  return Buffer.from(file.contents as Uint8Array);
}

type ArchiveOptions = {
  prepare?: (top: string) => Promise<void>;
  mutate?: (entry: { path: string; type: string }) => void;
  gzip?: boolean;
};

async function buildArchive(
  t: TestContext,
  files: Record<string, string | Uint8Array>,
  options: ArchiveOptions = {}
): Promise<string> {
  const sourceRoot = await tempDir(t);
  const top = path.join(sourceRoot, 'repo-main');
  await fsp.mkdir(top, { recursive: true });
  for (const [relative, contents] of Object.entries(files)) {
    const destination = path.join(top, ...relative.split('/'));
    await fsp.mkdir(path.dirname(destination), { recursive: true });
    await fsp.writeFile(destination, contents);
  }
  if (options.prepare) await options.prepare(top);

  const archivePath = path.join(await tempDir(t), 'template.tar.gz');
  await tarCreate(
    {
      file: archivePath,
      cwd: sourceRoot,
      gzip: options.gzip ?? true,
      // Keep archive creation synchronous so a mutated entry cannot leave the
      // pack stream writing after the test has finished.
      sync: true,
      ...(options.mutate ? { onWriteEntry: options.mutate } : {})
    },
    ['repo-main']
  );
  return archivePath;
}

type MockFetchOptions = {
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  urls?: string[];
};

function mockFetch(
  body: string | Uint8Array,
  options: MockFetchOptions = {}
): FetchLike {
  return async (url) => {
    options.urls?.push(url);
    return new Response(body, {
      status: options.status ?? 200,
      statusText: options.statusText,
      headers: options.headers
    });
  };
}

function remotePlan(
  targetDir: string,
  overrides: Partial<CreatePlan> = {}
): CreatePlan {
  return createPlan({
    targetDir,
    template: 'owner/repo#main',
    ...overrides
  });
}

test('creates a project from a local static fixture and is dry-run ready', async (t) => {
  const plan = createPlan({
    packageName: 'static-app',
    type: 'full-stack',
    database: 'pglite',
    template: path.join(fixtureRoot, 'static-basic')
  });
  const prepared = await prepareTemplateSource(plan);
  assert.equal(prepared.kind, 'static');

  const project = await resolveTemplateProject(prepared, plan);
  assert.doesNotThrow(() => validateResolvedProject(project));
  assert.deepEqual(
    project.files.map((file) => file.path),
    [
      '.env.sample',
      '.gitignore',
      'AGENTS.md',
      'README.md',
      'public/asset.txt',
      'src/index.ts'
    ]
  );
  assert.match(
    bytesFile(project, 'README.md').toString('utf8'),
    /\{\{name\}\}/
  );

  const target = path.join(await tempDir(t), 'static-app');
  const result = await writeProject(project, {
    targetDir: target,
    overwrite: false
  });
  assert.deepEqual(result.warnings, []);

  assert.deepEqual(await listFiles(target), [
    '.env.sample',
    '.gitignore',
    'AGENTS.md',
    'README.md',
    'package.json',
    'public/asset.txt',
    'src/index.ts'
  ]);

  const packageJson = await readJson(path.join(target, 'package.json'));
  assert.equal(packageJson.name, 'static-app');
  assert.equal(packageJson.private, true);
  assert.equal(packageJson.type, 'module');
  assert.deepEqual(packageJson.engines, { npm: '>=10', node: '>=22' });
  assert.deepEqual(packageJson.dependencies, {
    'fixture-runtime': '1.2.3'
  });

  assert.match(
    await fsp.readFile(path.join(target, 'README.md'), 'utf8'),
    /\{\{name\}\}/
  );
  assert.match(
    await fsp.readFile(path.join(target, '.gitignore'), 'utf8'),
    /node_modules/
  );
});

test('creates a project from a local manifest fixture', async (t) => {
  const plan = createPlan({
    packageName: 'manifest-app',
    type: 'api-only',
    database: 'postgres',
    template: path.join(fixtureRoot, 'manifest-basic')
  });
  const prepared = await prepareTemplateSource(plan);
  assert.equal(prepared.kind, 'manifest');

  const project = await resolveTemplateProject(prepared, plan);
  assert.deepEqual(
    project.files.map((file) => file.path),
    [
      '.env.sample',
      '.gitignore',
      'README.md',
      'config/app.ts',
      'public/logo.bin'
    ]
  );
  assert.match(textFile(project, 'README.md'), /^# manifest-app$/m);
  assert.match(textFile(project, 'README.md'), /Database: postgres/);

  const target = path.join(await tempDir(t), 'manifest-app');
  await writeProject(project, { targetDir: target, overwrite: false });

  assert.deepEqual(await listFiles(target), [
    '.env.sample',
    '.gitignore',
    'README.md',
    'config/app.ts',
    'package.json',
    'public/logo.bin'
  ]);

  const packageJson = await readJson(path.join(target, 'package.json'));
  assert.equal(packageJson.name, 'manifest-app');
  assert.deepEqual(packageJson.dependencies, {
    'base-dep': '2.0.0',
    'manifest-extra': '1.0.0'
  });
  assert.deepEqual(packageJson.scripts, {
    base: 'echo base',
    manifest: 'echo manifest'
  });

  const envSample = await fsp.readFile(
    path.join(target, '.env.sample'),
    'utf8'
  );
  assert.match(envSample, /APP_ENV=development/);
  assert.match(envSample, /DATABASE_URL=postgres:\/\/manifest-app\/pg/);
  assert.match(envSample, /MANIFEST_FLAG=true/);

  assert.match(
    await fsp.readFile(path.join(target, 'public/logo.bin'), 'utf8'),
    /\{\{name\}\}/
  );
});

test('extracts a valid GitHub-shaped archive and enforces archive limits', async (t) => {
  const archive = await buildArchive(t, {
    'package.json': '{"name":"remote"}\n',
    'README.md': '# remote\n',
    'src/index.ts': 'export const remote = true;\n'
  });

  const inspected = await inspectArchive(archive);
  assert.equal(inspected.fileCount, 3);
  assert.deepEqual(inspected.files, [
    'repo-main/README.md',
    'repo-main/package.json',
    'repo-main/src/index.ts'
  ]);

  const destination = path.join(await tempDir(t), 'out');
  const extracted = await extractArchive(archive, destination);
  assert.deepEqual(extracted.files, [
    'README.md',
    'package.json',
    'src/index.ts'
  ]);
  assert.equal(
    await fsp.readFile(path.join(destination, 'README.md'), 'utf8'),
    '# remote\n'
  );

  await assertCliAsync(
    inspectArchive(archive, { limits: { maxCompressedBytes: 10 } }),
    'PREFLIGHT',
    /compressed-size limit/
  );
  await assertCliAsync(
    inspectArchive(archive, { limits: { maxExtractedBytes: 5 } }),
    'PREFLIGHT',
    /expands to more than 5 bytes/
  );
  await assertCliAsync(
    inspectArchive(archive, { limits: { maxFileCount: 2 } }),
    'PREFLIGHT',
    /more than 2 files/
  );
  await assertCliAsync(
    inspectArchive(archive, { limits: { maxEntryCount: 2 } }),
    'PREFLIGHT',
    /more than 2 entries/
  );
});

test('rejects traversal, absolute paths, duplicates, symlinks, and hard links', async (t) => {
  const traversal = await buildArchive(
    t,
    { 'a.txt': 'a\n', 'escape.txt': 'escape\n' },
    {
      gzip: false,
      mutate: (entry) => {
        if (entry.path.endsWith('escape.txt')) entry.path = '../escape.txt';
      }
    }
  );
  await assertCliAsync(
    inspectArchive(traversal),
    'PREFLIGHT',
    /unsafe path/
  );

  const absolute = await buildArchive(
    t,
    { 'a.txt': 'a\n', 'escape.txt': 'escape\n' },
    {
      gzip: false,
      mutate: (entry) => {
        if (entry.path.endsWith('escape.txt')) entry.path = '/escape.txt';
      }
    }
  );
  await assertCliAsync(
    inspectArchive(absolute),
    'PREFLIGHT',
    /absolute path/
  );

  const duplicate = await buildArchive(
    t,
    { 'a.txt': 'a\n', 'b.txt': 'b\n' },
    {
      gzip: false,
      mutate: (entry) => {
        if (entry.path.endsWith('b.txt')) entry.path = 'repo-main/a.txt';
      }
    }
  );
  await assertCliAsync(
    inspectArchive(duplicate),
    'PREFLIGHT',
    /duplicate path/
  );

  const hardLinkArchive = await buildArchive(
    t,
    { 'a.txt': 'a\n' },
    {
      gzip: false,
      prepare: async (top) => {
        await fsp.link(path.join(top, 'a.txt'), path.join(top, 'hard.txt'));
      }
    }
  );
  await assertCliAsync(
    inspectArchive(hardLinkArchive),
    'PREFLIGHT',
    /symbolic link or hard link/
  );

  const symlinkRoot = await tempDir(t);
  const symlinkTop = path.join(symlinkRoot, 'repo-main');
  await fsp.mkdir(symlinkTop, { recursive: true });
  await fsp.writeFile(path.join(symlinkTop, 'a.txt'), 'a\n');
  try {
    await fsp.symlink('a.txt', path.join(symlinkTop, 'link.txt'));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EPERM' || code === 'EACCES' || code === 'UNKNOWN') {
      t.diagnostic(`symlinks are not available on this system (${code})`);
    } else {
      throw error;
    }
  }
  if (
    await fsp
      .lstat(path.join(symlinkTop, 'link.txt'))
      .then((stats) => stats.isSymbolicLink())
      .catch(() => false)
  ) {
    const symlinkArchive = path.join(symlinkRoot, 'template.tar.gz');
    await tarCreate(
      { file: symlinkArchive, cwd: symlinkRoot, gzip: true },
      ['repo-main']
    );
    await assertCliAsync(
      inspectArchive(symlinkArchive),
      'PREFLIGHT',
      /symbolic link or hard link/
    );
  }

  const destination = path.join(await tempDir(t), 'should-not-exist');
  await assertCliAsync(
    extractArchive(traversal, destination),
    'PREFLIGHT',
    /unsafe path/
  );
  assert.equal(existsSync(destination), false);
});

test('mocks fetch to download and extract a static GitHub tarball', async (t) => {
  const archive = await buildArchive(t, {
    'package.json': '{"name":"remote","scripts":{"dev":"echo dev"}}\n',
    'README.md': '# remote\n',
    'src/index.ts': 'export const remote = true;\n'
  });
  const archiveBytes = await fsp.readFile(archive);
  const tempRoot = await tempDir(t);
  const target = path.join(await tempDir(t), 'remote-app');
  const plan = remotePlan(target, {
    packageName: 'remote-app',
    type: 'full-stack',
    database: 'pglite'
  });
  const urls: string[] = [];

  const prepared = await prepareTemplateSource(plan, {
    fetch: mockFetch(archiveBytes, { urls }),
    tempRoot,
    isLocalDirectory: () => false
  });
  t.after(async () => {
    await prepared.cleanup();
  });

  assert.equal(prepared.kind, 'static');
  assert.equal(prepared.source.kind, 'github');
  assert.ok(prepared.root.startsWith(tempRoot));
  assert.deepEqual(await fsp.readdir(tempRoot), [
    path.basename(path.dirname(prepared.root))
  ]);
  assert.deepEqual(urls, [
    'https://codeload.github.com/owner/repo/tar.gz/main'
  ]);

  const project = await resolveTemplateProject(prepared, plan);
  assert.deepEqual(
    project.files.map((file) => file.path),
    ['README.md', 'src/index.ts']
  );
  assert.equal(project.packageJson.name, 'remote-app');
  assert.deepEqual(project.packageJson.scripts, { dev: 'echo dev' });

  await prepared.cleanup();
  await prepared.cleanup();
  assert.deepEqual(await fsp.readdir(tempRoot), []);
});

test('mocks fetch to download and extract a manifest GitHub tarball', async (t) => {
  const archive = await buildArchive(t, {
    'create-stackpress.json': `${JSON.stringify({
      schemaVersion: 1,
      types: ['minimal'],
      files: ['README.md'],
      package: { dependencies: { 'remote-dep': '1.0.0' } },
      env: ['REMOTE=1']
    })}\n`,
    'README.md': '# {{name}}\n'
  });
  const archiveBytes = await fsp.readFile(archive);
  const tempRoot = await tempDir(t);
  const target = path.join(await tempDir(t), 'remote-manifest-app');
  const plan = remotePlan(target, {
    packageName: 'remote-manifest-app',
    type: 'minimal',
    database: 'pglite'
  });

  const prepared = await prepareTemplateSource(plan, {
    fetch: mockFetch(archiveBytes),
    tempRoot,
    isLocalDirectory: () => false
  });
  t.after(async () => {
    await prepared.cleanup();
  });

  assert.equal(prepared.kind, 'manifest');
  assert.ok(prepared.manifest);
  const project = await resolveTemplateProject(prepared, plan);
  assert.match(textFile(project, 'README.md'), /^# remote-manifest-app$/m);
  assert.deepEqual(project.packageJson.dependencies, {
    'remote-dep': '1.0.0'
  });
  assert.deepEqual(project.env, ['REMOTE=1']);
  assert.match(textFile(project, '.env.sample'), /REMOTE=1/);
  assert.deepEqual(project.capabilities, ['database']);
});

test('remote fetch and extraction failures clean up temporary directories', async (t) => {
  const target = path.join(await tempDir(t), 'failure-app');

  const notFoundRoot = await tempDir(t);
  await assertCliAsync(
    prepareTemplateSource(remotePlan(target), {
      fetch: mockFetch('not found', {
        status: 404,
        statusText: 'Not Found'
      }),
      tempRoot: notFoundRoot,
      isLocalDirectory: () => false
    }),
    'PREFLIGHT',
    /HTTP 404/
  );
  assert.deepEqual(await fsp.readdir(notFoundRoot), []);

  const networkRoot = await tempDir(t);
  await assertCliAsync(
    prepareTemplateSource(remotePlan(target), {
      fetch: async () => {
        throw new Error('network down');
      },
      tempRoot: networkRoot,
      isLocalDirectory: () => false
    }),
    'PREFLIGHT',
    /Failed to download/
  );
  assert.deepEqual(await fsp.readdir(networkRoot), []);

  const invalidRoot = await tempDir(t);
  await assertCliAsync(
    prepareTemplateSource(remotePlan(target), {
      fetch: mockFetch('this is not a tarball'),
      tempRoot: invalidRoot,
      isLocalDirectory: () => false
    }),
    'PREFLIGHT',
    /contains no entries|Unable to read template archive|corrupt/
  );
  assert.deepEqual(await fsp.readdir(invalidRoot), []);

  const invalidManifestArchive = await buildArchive(t, {
    'create-stackpress.json': '{not json}\n',
    'README.md': '# invalid manifest\n'
  });
  const invalidManifestBytes = await fsp.readFile(invalidManifestArchive);
  const invalidManifestRoot = await tempDir(t);
  await assertCliAsync(
    prepareTemplateSource(remotePlan(target), {
      fetch: mockFetch(invalidManifestBytes),
      tempRoot: invalidManifestRoot,
      isLocalDirectory: () => false
    }),
    'GENERATION',
    /not valid JSON/
  );
  assert.deepEqual(await fsp.readdir(invalidManifestRoot), []);

  const oversizedRoot = await tempDir(t);
  await assertCliAsync(
    prepareTemplateSource(remotePlan(target), {
      fetch: mockFetch(new Uint8Array(100)),
      tempRoot: oversizedRoot,
      limits: { maxCompressedBytes: 10 },
      isLocalDirectory: () => false
    }),
    'PREFLIGHT',
    /compressed-size limit/
  );
  assert.deepEqual(await fsp.readdir(oversizedRoot), []);

  const lengthRoot = await tempDir(t);
  await assertCliAsync(
    prepareTemplateSource(remotePlan(target), {
      fetch: mockFetch('small', {
        headers: { 'content-length': '9999' }
      }),
      tempRoot: lengthRoot,
      limits: { maxCompressedBytes: 10 },
      isLocalDirectory: () => false
    }),
    'PREFLIGHT',
    /compressed-size limit/
  );
  assert.deepEqual(await fsp.readdir(lengthRoot), []);
});

test('remote archive limits apply through prepareTemplateSource', async (t) => {
  const archive = await buildArchive(t, {
    'a.txt': 'a\n',
    'b.txt': 'b\n',
    'c.txt': 'c\n'
  });
  const archiveBytes = await fsp.readFile(archive);
  const target = path.join(await tempDir(t), 'limited-remote-app');

  const root = await tempDir(t);
  await assertCliAsync(
    prepareTemplateSource(remotePlan(target), {
      fetch: mockFetch(archiveBytes),
      tempRoot: root,
      limits: { maxFileCount: 2 },
      isLocalDirectory: () => false
    }),
    'PREFLIGHT',
    /more than 2 files/
  );
  assert.deepEqual(await fsp.readdir(root), []);
});

test('live GitHub template smoke test (opt-in)', async (t) => {
  const live = process.env.CREATE_STACKPRESS_LIVE_TEMPLATE;
  if (!live) {
    t.skip('set CREATE_STACKPRESS_LIVE_TEMPLATE=1 to run the live smoke test');
    return;
  }
  const source = live === '1' ? 'octocat/Hello-World' : live;
  const tempRoot = await tempDir(t);
  const target = path.join(await tempDir(t), 'live-app');
  const plan = createPlan({
    packageName: 'live-app',
    template: source,
    type: 'full-stack',
    database: 'pglite'
  });

  const prepared = await prepareTemplateSource(plan, { tempRoot });
  t.after(async () => {
    await prepared.cleanup();
  });
  const project = await resolveTemplateProject(prepared, plan);
  assert.ok(project.files.length > 0);
  await prepared.cleanup();
  assert.deepEqual(await fsp.readdir(tempRoot), []);
});
