import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test, { type TestContext } from 'node:test';
import { CliError, type CliErrorCode } from '../../src/errors.js';
import type { CreatePlan } from '../../src/types.js';
import {
  DEFAULT_ARCHIVE_LIMITS,
  normalizeArchiveEntryPath,
  resolveArchiveLimits,
  walkTemplateTree
} from '../../src/template/archive.js';
import {
  TEMPLATE_MANIFEST_FILE,
  assertStaticTemplatePlan,
  assertTemplateCompatibility,
  loadTemplateManifest,
  parseTemplateSource,
  prepareTemplateSource,
  resolveTemplateProject,
  templateSupportsDatabase,
  templateSupportsType,
  validateTemplateManifest
} from '../../src/template/source.js';
import type {
  PreparedTemplate,
  TemplateManifest
} from '../../src/template/source.js';
import { validateResolvedProject } from '../../src/template/validate.js';

const fixtureRoot = fileURLToPath(
  new URL('../fixtures/templates', import.meta.url)
);

function createPlan(overrides: Partial<CreatePlan> = {}): CreatePlan {
  return {
    targetDir: path.join(os.tmpdir(), 'stackpress-template-app'),
    packageName: 'stackpress-template-app',
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
    path.join(os.tmpdir(), 'stackpress-template-test-')
  );
  t.after(async () => {
    await fsp.rm(directory, { recursive: true, force: true });
  });
  return directory;
}

async function copyFixture(
  t: TestContext,
  name: string
): Promise<string> {
  const directory = await tempDir(t);
  const root = path.join(directory, 'template');
  await fsp.cp(path.join(fixtureRoot, name), root, { recursive: true });
  return root;
}

function assertCliSync(
  action: () => unknown,
  code: CliErrorCode,
  pattern?: RegExp
): void {
  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof CliError);
    assert.equal(error.code, code);
    if (pattern) assert.match(error.message, pattern);
    return true;
  });
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

function textFile(
  project: Awaited<ReturnType<typeof resolveTemplateProject>>,
  filePath: string
): string {
  const file = project.files.find((candidate) => candidate.path === filePath);
  assert.ok(file, `expected ${filePath} in resolved files`);
  assert.equal(file.binary, false);
  assert.equal(typeof file.contents, 'string');
  return file.contents as string;
}

function bytesFile(
  project: Awaited<ReturnType<typeof resolveTemplateProject>>,
  filePath: string
): Buffer {
  const file = project.files.find((candidate) => candidate.path === filePath);
  assert.ok(file, `expected ${filePath} in resolved files`);
  assert.equal(file.binary, true);
  assert.ok(file.contents instanceof Uint8Array);
  return Buffer.from(file.contents);
}

async function readJson(
  filePath: string
): Promise<Record<string, unknown>> {
  return JSON.parse(await fsp.readFile(filePath, 'utf8')) as Record<
    string,
    unknown
  >;
}

async function updateJson(
  filePath: string,
  update: (value: Record<string, any>) => void
): Promise<void> {
  const value = await readJson(filePath);
  update(value);
  await fsp.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function preparedManifest(
  t: TestContext,
  plan: CreatePlan,
  fixture = 'manifest-basic'
): Promise<{ root: string; prepared: PreparedTemplate }> {
  const root = await copyFixture(t, fixture);
  const prepared = await prepareTemplateSource(
    { ...plan, template: root },
    { cwd: root }
  );
  return { root, prepared };
}

test('parses local template paths', () => {
  for (const value of [
    './template',
    '../template',
    '.\\template',
    '..\\template',
    '/tmp/template',
    '\\server\\share\\template',
    'C:\\templates\\app',
    'C:/templates/app',
    '~/templates/app',
    'my-template'
  ]) {
    const source = parseTemplateSource(value, {
      cwd: os.tmpdir(),
      isLocalDirectory: () => false
    });
    assert.equal(source.kind, 'local', value);
    assert.equal(source.path, value);
  }

  const fileUrl = pathToFileURL(
    path.join(os.tmpdir(), 'file-url-template')
  ).href;
  const fileSource = parseTemplateSource(fileUrl, {
    isLocalDirectory: () => false
  });
  assert.equal(fileSource.kind, 'local');
  assert.equal(fileSource.path, path.join(os.tmpdir(), 'file-url-template'));
});

test('parses GitHub shorthand and refs', () => {
  const source = parseTemplateSource('owner/repo', {
    isLocalDirectory: () => false
  });
  assert.equal(source.kind, 'github');
  assert.equal(source.owner, 'owner');
  assert.equal(source.repo, 'repo');
  assert.equal(source.ref, undefined);
  assert.equal(
    source.tarballUrl,
    'https://codeload.github.com/owner/repo/tar.gz/HEAD'
  );

  const refSource = parseTemplateSource('owner/repo#feature/x', {
    isLocalDirectory: () => false
  });
  assert.equal(refSource.kind, 'github');
  assert.equal(refSource.ref, 'feature/x');
  assert.equal(
    refSource.tarballUrl,
    'https://codeload.github.com/owner/repo/tar.gz/feature/x'
  );
  assert.equal(refSource.display, 'github:owner/repo#feature/x');

  const gitSuffix = parseTemplateSource('owner/repo.git#main', {
    isLocalDirectory: () => false
  });
  assert.equal(gitSuffix.kind, 'github');
  assert.equal(gitSuffix.repo, 'repo');
  assert.equal(gitSuffix.ref, 'main');

  const prefixed = parseTemplateSource('github:owner/repo#v1.2.3', {
    isLocalDirectory: () => false
  });
  assert.equal(prefixed.kind, 'github');
  assert.equal(prefixed.ref, 'v1.2.3');
});

test('prefers an existing local directory over owner/repo shorthand', () => {
  const local = parseTemplateSource('owner/repo', {
    cwd: os.tmpdir(),
    isLocalDirectory: () => true
  });
  assert.equal(local.kind, 'local');
  assert.equal(local.path, 'owner/repo');

  const remote = parseTemplateSource('templates/mine', {
    cwd: os.tmpdir(),
    isLocalDirectory: () => false
  });
  assert.equal(remote.kind, 'github');
  assert.equal(remote.owner, 'templates');
  assert.equal(remote.repo, 'mine');
});

test('parses GitHub URLs with optional refs', () => {
  const expectations: Array<{ value: string; ref?: string }> = [
    { value: 'https://github.com/owner/repo' },
    { value: 'http://github.com/owner/repo', ref: undefined },
    { value: 'https://github.com/owner/repo.git#main', ref: 'main' },
    {
      value: 'https://github.com/owner/repo/tree/feature/x',
      ref: 'feature/x'
    },
    {
      value: 'https://github.com/owner/repo/archive/refs/heads/main.tar.gz',
      ref: 'main'
    },
    {
      value: 'https://github.com/owner/repo/archive/refs/tags/v1.0.0.tgz',
      ref: 'v1.0.0'
    },
    { value: 'https://github.com/owner/repo#develop', ref: 'develop' },
    { value: 'git+https://github.com/owner/repo', ref: undefined },
    { value: 'git@github.com:owner/repo.git#main', ref: 'main' },
    { value: 'ssh://git@github.com/owner/repo.git', ref: undefined }
  ];

  for (const expectation of expectations) {
    const source = parseTemplateSource(expectation.value, {
      isLocalDirectory: () => false
    });
    assert.equal(source.kind, 'github', expectation.value);
    assert.equal(source.owner, 'owner', expectation.value);
    assert.equal(source.repo, 'repo', expectation.value);
    assert.equal(source.ref, expectation.ref, expectation.value);
  }
});

test('rejects malformed and non-GitHub template sources', () => {
  for (const value of [
    '',
    ' owner/repo',
    'owner/repo ',
    'https://gitlab.com/owner/repo',
    'https://github.com/owner',
    'https://github.com/owner/repo/archive/main.zip',
    'https://github.com/owner/repo/tree',
    'owner/repo#../main',
    'owner/repo#main ref',
    'owner/repo#main//x',
    'ftp://github.com/owner/repo'
  ]) {
    assertCliSync(
      () => parseTemplateSource(value, { isLocalDirectory: () => false }),
      'USAGE'
    );
  }
});

test('template source errors do not echo URL credentials', () => {
  for (const value of [
    'ftp://user:pass@github.com/owner/repo',
    'https://user:pass@'
  ]) {
    assert.throws(
      () => parseTemplateSource(value, { isLocalDirectory: () => false }),
      (error: unknown) => {
        assert.ok(error instanceof CliError);
        assert.equal(error.code, 'USAGE');
        assert.doesNotMatch(error.message, /user:pass/);
        assert.doesNotMatch(error.message, /pass/);
        return true;
      },
      value
    );
  }
});

test('validates the create-stackpress.json schema', () => {
  const manifest = validateTemplateManifest({
    schemaVersion: 1,
    name: 'fixture',
    version: '1.2.3',
    types: ['api-only', 'minimal'],
    databases: ['pglite', 'postgres'],
    files: ['README.md', 'config/app.ts'],
    assets: ['public/logo.bin'],
    package: {
      dependencies: { pg: '8.16.3' },
      scripts: { dev: 'stackpress serve' },
      plugins: ['stackpress']
    },
    env: ['APP_ENV=development'],
    capabilities: ['api', 'auth', 'database']
  });
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.name, 'fixture');
  assert.deepEqual(manifest.types, ['api-only', 'minimal']);
  assert.deepEqual(manifest.databases, ['pglite', 'postgres']);
  assert.deepEqual(manifest.files, ['README.md', 'config/app.ts']);
  assert.deepEqual(manifest.assets, ['public/logo.bin']);
  assert.deepEqual(manifest.env, ['APP_ENV=development']);
  assert.deepEqual(manifest.capabilities, ['api', 'auth', 'database']);

  assertCliSync(
    () => validateTemplateManifest({ ...manifest, extra: true }),
    'GENERATION',
    /unknown field "extra"/
  );
  assertCliSync(
    () => validateTemplateManifest({ ...manifest, schemaVersion: 2 }),
    'GENERATION',
    /schemaVersion/
  );
  assertCliSync(
    () => validateTemplateManifest({ ...manifest, types: [] }),
    'GENERATION',
    /non-empty array/
  );
  assertCliSync(
    () => validateTemplateManifest({ ...manifest, types: ['blank'] }),
    'GENERATION',
    /types\[0\]/
  );
  assertCliSync(
    () => validateTemplateManifest({ ...manifest, types: ['minimal', 'minimal'] }),
    'GENERATION',
    /duplicate "types"/
  );
  assertCliSync(
    () => validateTemplateManifest({ ...manifest, databases: ['oracle'] }),
    'GENERATION',
    /databases\[0\]/
  );
  assertCliSync(
    () => validateTemplateManifest({ ...manifest, databases: ['pglite', 'pglite'] }),
    'GENERATION',
    /duplicate "databases"/
  );
});

test('rejects unsafe and reserved manifest paths', () => {
  for (const filePath of [
    '/etc/passwd',
    '../outside',
    'config/../outside',
    'config\\app.ts',
    'C:/windows/app.ts',
    'config//app.ts',
    'config/'
  ]) {
    assertCliSync(
      () => validateTemplateManifest({
        schemaVersion: 1,
        files: [filePath]
      }),
      'GENERATION',
      /relative POSIX path/
    );
  }

  assertCliSync(
    () =>
      validateTemplateManifest({
        schemaVersion: 1,
        files: ['package.json']
      }),
    'GENERATION',
    /CLI owns that file/
  );
  assertCliSync(
    () =>
      validateTemplateManifest({
        schemaVersion: 1,
        files: [TEMPLATE_MANIFEST_FILE]
      }),
    'GENERATION',
    /CLI owns that file/
  );
  assertCliSync(
    () =>
      validateTemplateManifest({
        schemaVersion: 1,
        files: ['.git/config']
      }),
    'GENERATION',
    /\.git/
  );
  assertCliSync(
    () =>
      validateTemplateManifest({
        schemaVersion: 1,
        files: ['README.md', 'README.md']
      }),
    'GENERATION',
    /duplicate "files"/
  );
  assertCliSync(
    () =>
      validateTemplateManifest({
        schemaVersion: 1,
        files: ['README.md'],
        assets: ['README.md']
      }),
    'GENERATION',
    /both a file and an asset/
  );
});

test('rejects invalid manifest env, capabilities, and package data', () => {
  assertCliSync(
    () =>
      validateTemplateManifest({
        schemaVersion: 1,
        env: ['NOT_AN_ENV_LINE']
      }),
    'GENERATION',
    /invalid env entry/
  );
  assertCliSync(
    () =>
      validateTemplateManifest({
        schemaVersion: 1,
        env: ['A=1', 'A=2']
      }),
    'GENERATION',
    /duplicate env key/
  );
  assertCliSync(
    () =>
      validateTemplateManifest({
        schemaVersion: 1,
        capabilities: ['billing']
      }),
    'GENERATION',
    /canonical capability/
  );
  assertCliSync(
    () =>
      validateTemplateManifest({
        schemaVersion: 1,
        capabilities: ['api', 'api']
      }),
    'GENERATION',
    /duplicate capability/
  );
  assertCliSync(
    () =>
      validateTemplateManifest({
        schemaVersion: 1,
        package: { optionalDependencies: { pg: '1.0.0' } }
      }),
    'GENERATION',
    /unknown package field/
  );
  assertCliSync(
    () =>
      validateTemplateManifest({
        schemaVersion: 1,
        name: ' padded '
      }),
    'GENERATION',
    /whitespace/
  );
});

test('checks manifest compatibility for types, databases, and capabilities', () => {
  const manifest: TemplateManifest = {
    schemaVersion: 1,
    types: ['api-only'],
    databases: ['pglite'],
    capabilities: ['api', 'auth', 'database']
  };
  const plan = createPlan({ type: 'api-only', database: 'pglite' });

  assert.doesNotThrow(() => assertTemplateCompatibility(plan, manifest));
  assert.equal(templateSupportsType(manifest, 'api-only'), true);
  assert.equal(templateSupportsType(manifest, 'minimal'), false);
  assert.equal(templateSupportsDatabase(manifest, 'pglite'), true);
  assert.equal(templateSupportsDatabase(manifest, 'postgres'), false);

  assertCliSync(
    () => assertTemplateCompatibility(createPlan({ type: 'minimal' }), manifest),
    'USAGE',
    /does not support project type "minimal"/
  );
  assertCliSync(
    () =>
      assertTemplateCompatibility(
        createPlan({ type: 'api-only', database: 'postgres' }),
        manifest
      ),
    'USAGE',
    /does not support database "postgres"/
  );

  const missingCapability: TemplateManifest = {
    schemaVersion: 1,
    capabilities: ['database']
  };
  assertCliSync(
    () => assertTemplateCompatibility(plan, missingCapability),
    'USAGE',
    /missing: api, auth/
  );

  assert.doesNotThrow(() =>
    assertTemplateCompatibility(
      createPlan({ type: 'full-stack' }),
      { schemaVersion: 1 }
    )
  );
});

test('rejects --type and --db for static templates', () => {
  const plan = createPlan();
  assert.doesNotThrow(() => assertStaticTemplatePlan(plan, false, false));
  assertCliSync(
    () => assertStaticTemplatePlan(plan, true, false),
    'USAGE',
    /--type api-only/
  );
  assertCliSync(
    () => assertStaticTemplatePlan(plan, false, true),
    'USAGE',
    /--db pglite/
  );
  assertCliSync(
    () => assertStaticTemplatePlan(plan, true, true),
    'USAGE',
    /--type api-only and --db pglite/
  );
});

test('validates archive entry paths', () => {
  assert.deepEqual(normalizeArchiveEntryPath('config/app.ts'), {
    path: 'config/app.ts',
    directory: false
  });
  assert.deepEqual(normalizeArchiveEntryPath('config/'), {
    path: 'config',
    directory: true
  });

  for (const value of [
    '',
    '/etc/passwd',
    '\\windows\\system32',
    'C:/windows/app.ts',
    '../escape.txt',
    'config/../escape.txt',
    'config\\app.ts',
    'config//app.ts',
    'config/./app.ts',
    'config/\u0000app.ts'
  ]) {
    assertCliSync(
      () => normalizeArchiveEntryPath(value),
      'PREFLIGHT',
      /empty path|absolute path|unsafe path|control characters/
    );
  }
});

test('walks template trees and enforces file-count and byte limits', async (t) => {
  const root = await tempDir(t);
  await fsp.writeFile(path.join(root, 'one.txt'), 'one');
  await fsp.writeFile(path.join(root, 'two.txt'), 'two');
  await fsp.writeFile(path.join(root, 'three.txt'), 'three');

  const tree = await walkTemplateTree(root);
  assert.equal(tree.fileCount, 3);
  assert.equal(tree.totalBytes, 11);
  assert.deepEqual(
    tree.files.map((entry) => entry.path),
    ['one.txt', 'three.txt', 'two.txt']
  );

  await assertCliAsync(
    walkTemplateTree(root, { limits: { maxFileCount: 2 } }),
    'PREFLIGHT',
    /more than 2 files/
  );
  await assertCliAsync(
    walkTemplateTree(root, { limits: { maxExtractedBytes: 4 } }),
    'PREFLIGHT',
    /expands to more than 4 bytes/
  );
  assertCliSync(
    () => resolveArchiveLimits({ maxFileCount: 0 }),
    'USAGE',
    /maxFileCount/
  );
  assert.equal(DEFAULT_ARCHIVE_LIMITS.maxCompressedBytes, 10 * 1024 * 1024);
  assert.equal(DEFAULT_ARCHIVE_LIMITS.maxExtractedBytes, 100 * 1024 * 1024);
  assert.equal(DEFAULT_ARCHIVE_LIMITS.maxFileCount, 1000);
});

test('rejects symlinks and hard links in local template trees', async (t) => {
  const symlinkRoot = await tempDir(t);
  await fsp.writeFile(path.join(symlinkRoot, 'README.md'), 'readme\n');
  try {
    await fsp.symlink('README.md', path.join(symlinkRoot, 'link.md'));
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
      .lstat(path.join(symlinkRoot, 'link.md'))
      .then((stats) => stats.isSymbolicLink())
      .catch(() => false)
  ) {
    await assertCliAsync(
      walkTemplateTree(symlinkRoot),
      'PREFLIGHT',
      /symbolic link/
    );
  }

  const hardRoot = await tempDir(t);
  await fsp.writeFile(path.join(hardRoot, 'target.txt'), 'target\n');
  try {
    await fsp.link(
      path.join(hardRoot, 'target.txt'),
      path.join(hardRoot, 'hard.txt')
    );
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EPERM' || code === 'EACCES' || code === 'UNKNOWN') {
      t.diagnostic(`hard links are not available on this system (${code})`);
      return;
    }
    throw error;
  }
  await assertCliAsync(walkTemplateTree(hardRoot), 'PREFLIGHT', /hard link/);
});

test('loads the optional template manifest', async () => {
  const staticRoot = path.join(fixtureRoot, 'static-basic');
  assert.equal(await loadTemplateManifest(staticRoot), undefined);

  const manifestRoot = path.join(fixtureRoot, 'manifest-basic');
  const manifest = await loadTemplateManifest(manifestRoot);
  assert.ok(manifest);
  assert.equal(manifest.name, 'manifest-basic');
  assert.equal(manifest.version, '1.2.3');
  assert.deepEqual(manifest.types, ['api-only', 'minimal']);
  assert.deepEqual(manifest.databases, ['pglite', 'postgres']);
});

test('resolves a manifest template with tokens, package, env, and assets', async (t) => {
  const plan = createPlan({
    packageName: 'manifest-app',
    type: 'api-only',
    database: 'postgres',
    template: path.join(fixtureRoot, 'manifest-basic')
  });
  const prepared = await prepareTemplateSource(plan);
  assert.equal(prepared.kind, 'manifest');
  assert.ok(prepared.manifest);
  await prepared.cleanup();

  const project = await resolveTemplateProject(prepared, plan);
  assert.deepEqual(
    project.files.map((file) => [file.path, file.binary]),
    [
      ['.env.sample', false],
      ['.gitignore', false],
      ['README.md', false],
      ['config/app.ts', false],
      ['public/logo.bin', true]
    ]
  );

  const readme = textFile(project, 'README.md');
  assert.match(readme, /^# manifest-app$/m);
  assert.match(readme, /Type: api-only/);
  assert.match(readme, /Database: postgres/);
  assert.match(readme, /Adapter: @stackpress\/inquire-pg/);
  assert.match(readme, /Driver: pg/);
  assert.doesNotMatch(readme, /\{\{/);

  const app = textFile(project, 'config/app.ts');
  assert.match(app, /name: 'manifest-app'/);
  assert.match(app, /type: 'api-only'/);
  assert.match(app, /database: 'postgres'/);

  const asset = bytesFile(project, 'public/logo.bin').toString('utf8');
  assert.match(asset, /\{\{name\}\}/);

  assert.deepEqual(project.packageJson, {
    name: 'manifest-app',
    private: true,
    type: 'module',
    engines: { node: '>=22' },
    scripts: {
      base: 'echo base',
      manifest: 'echo manifest'
    },
    dependencies: {
      'base-dep': '2.0.0',
      'manifest-extra': '1.0.0'
    },
    devDependencies: {
      'base-dev': '3.0.0'
    },
    plugins: ['base/plugin', 'manifest/plugin']
  });
  assert.deepEqual(project.env, [
    'APP_ENV=development',
    'DATABASE_URL=postgres://manifest-app/pg',
    'MANIFEST_FLAG=true'
  ]);
  assert.match(
    textFile(project, '.env.sample'),
    /DATABASE_URL=postgres:\/\/manifest-app\/pg/
  );
  assert.match(textFile(project, '.env.sample'), /MANIFEST_FLAG=true/);
  assert.deepEqual(project.capabilities, ['api', 'auth', 'database']);
  assert.deepEqual(project.plugins, ['base/plugin', 'manifest/plugin']);
  assert.doesNotThrow(() => validateResolvedProject(project));
});

test('manifest templates honor --no-agents-md and reject bad declarations', async (t) => {
  const { root } = await preparedManifest(
    t,
    createPlan({ packageName: 'agents-app' })
  );
  await fsp.writeFile(path.join(root, 'AGENTS.md'), '# agents\n');
  await updateJson(path.join(root, TEMPLATE_MANIFEST_FILE), (value) => {
    (value.files as string[]).push('AGENTS.md');
  });
  const plan = createPlan({
    packageName: 'agents-app',
    template: root,
    noAgentsMd: true
  });
  const prepared = await prepareTemplateSource(plan);
  const project = await resolveTemplateProject(prepared, plan);
  assert.equal(
    project.files.some((file) => file.path === 'AGENTS.md'),
    false
  );

  const missingRoot = await copyFixture(t, 'manifest-basic');
  await updateJson(
    path.join(missingRoot, TEMPLATE_MANIFEST_FILE),
    (value) => {
      (value.files as string[]).push('missing.txt');
    }
  );
  const missingPlan = createPlan({
    packageName: 'missing-app',
    template: missingRoot
  });
  const missingPrepared = await prepareTemplateSource(missingPlan);
  await assertCliAsync(
    resolveTemplateProject(missingPrepared, missingPlan),
    'GENERATION',
    /not found.*missing\.txt/
  );

  const tokenRoot = await copyFixture(t, 'manifest-basic');
  await fsp.appendFile(
    path.join(tokenRoot, 'README.md'),
    '\n{{unknown_token}}\n'
  );
  const tokenPlan = createPlan({
    packageName: 'token-app',
    template: tokenRoot
  });
  const tokenPrepared = await prepareTemplateSource(tokenPlan);
  await assertCliAsync(
    resolveTemplateProject(tokenPrepared, tokenPlan),
    'GENERATION',
    /Unresolved template token/
  );

  const conflictRoot = await copyFixture(t, 'manifest-basic');
  await updateJson(
    path.join(conflictRoot, TEMPLATE_MANIFEST_FILE),
    (value) => {
      value.package.dependencies['base-dep'] = '9.9.9';
    }
  );
  const conflictPlan = createPlan({
    packageName: 'conflict-app',
    template: conflictRoot
  });
  const conflictPrepared = await prepareTemplateSource(conflictPlan);
  await assertCliAsync(
    resolveTemplateProject(conflictPrepared, conflictPlan),
    'GENERATION',
    /Conflicting dependency entry "base-dep"/
  );

  const duplicateRoot = await copyFixture(t, 'manifest-basic');
  await fsp.writeFile(
    path.join(duplicateRoot, '.gitignore'),
    'node_modules/\n'
  );
  await updateJson(
    path.join(duplicateRoot, TEMPLATE_MANIFEST_FILE),
    (value) => {
      (value.files as string[]).push('.gitignore');
    }
  );
  const duplicatePlan = createPlan({
    packageName: 'duplicate-app',
    template: duplicateRoot
  });
  const duplicatePrepared = await prepareTemplateSource(duplicatePlan);
  await assertCliAsync(
    resolveTemplateProject(duplicatePrepared, duplicatePlan),
    'GENERATION',
    /duplicate file "\.gitignore"/
  );
});

test('rejects unsupported manifest template choices before resolution', async (t) => {
  const { root, prepared } = await preparedManifest(
    t,
    createPlan({ packageName: 'compat-app' })
  );
  const unsupportedType = createPlan({
    packageName: 'compat-app',
    type: 'full-stack',
    template: root
  });
  await assertCliAsync(
    resolveTemplateProject(prepared, unsupportedType),
    'USAGE',
    /does not support project type "full-stack"/
  );

  const unsupportedDatabase = createPlan({
    packageName: 'compat-app',
    database: 'sqlite',
    template: root
  });
  await assertCliAsync(
    resolveTemplateProject(prepared, unsupportedDatabase),
    'USAGE',
    /does not support database "sqlite"/
  );
});

test('manifest templates reject hard-linked declared files', async (t) => {
  const root = await copyFixture(t, 'manifest-basic');
  const source = path.join(root, 'README.md');
  const hardPath = path.join(root, 'hard.md');
  try {
    await fsp.link(source, hardPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EPERM' || code === 'EACCES' || code === 'UNKNOWN') {
      t.skip(`hard links are not available on this system (${code})`);
      return;
    }
    throw error;
  }

  await updateJson(path.join(root, TEMPLATE_MANIFEST_FILE), (value) => {
    (value.files as string[]).push('hard.md');
  });
  const plan = createPlan({
    packageName: 'hard-app',
    template: root
  });
  const prepared = await prepareTemplateSource(plan);
  await assertCliAsync(
    resolveTemplateProject(prepared, plan),
    'GENERATION',
    /hard link/
  );
});

test('resolves a static template byte-for-byte and overrides package identity', async (t) => {
  const plan = createPlan({
    packageName: 'static-app',
    type: 'full-stack',
    database: 'pglite',
    template: path.join(fixtureRoot, 'static-basic')
  });
  const prepared = await prepareTemplateSource(plan);
  assert.equal(prepared.kind, 'static');
  assert.equal(prepared.manifest, undefined);

  const project = await resolveTemplateProject(prepared, plan);
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
  assert.equal(
    project.files.some((file) => file.path === 'package.json'),
    false
  );
  assert.match(bytesFile(project, 'README.md').toString('utf8'), /\{\{name\}\}/);
  assert.match(bytesFile(project, '.gitignore').toString('utf8'), /node_modules/);
  assert.match(
    bytesFile(project, 'public/asset.txt').toString('utf8'),
    /\{\{name\}\} stays literal/
  );

  assert.equal(project.packageJson.name, 'static-app');
  assert.equal(project.packageJson.private, true);
  assert.equal(project.packageJson.type, 'module');
  assert.deepEqual(project.packageJson.engines, {
    npm: '>=10',
    node: '>=22'
  });
  assert.equal(project.packageJson.description, 'Static fixture template');
  assert.deepEqual(project.packageJson.scripts, {
    dev: 'node src/index.js',
    build: 'node src/index.js --build'
  });
  assert.deepEqual(project.packageJson.dependencies, {
    'fixture-runtime': '1.2.3'
  });
  assert.deepEqual(project.packageJson.plugins, [
    'fixture/plugin',
    'stackpress'
  ]);
  assert.deepEqual(project.env, [
    'APP_ENV=development',
    'DATABASE_URL=postgres://fixture:fixture@localhost:5432/fixture'
  ]);
  assert.deepEqual(project.capabilities, [
    'views',
    'admin',
    'api',
    'auth',
    'content',
    'database'
  ]);
  assert.doesNotThrow(() => validateResolvedProject(project));

  const noAgentsPlan = { ...plan, noAgentsMd: true };
  const noAgents = await resolveTemplateProject(prepared, noAgentsPlan);
  assert.equal(
    noAgents.files.some((file) => file.path === 'AGENTS.md'),
    true,
    '--no-agents-md has no effect on static templates'
  );
});

test('static templates without package.json get a minimal package', async (t) => {
  const plan = createPlan({
    packageName: 'bare-app',
    template: path.join(fixtureRoot, 'static-no-package')
  });
  const prepared = await prepareTemplateSource(plan);
  const project = await resolveTemplateProject(prepared, plan);

  assert.deepEqual(project.packageJson, {
    name: 'bare-app',
    private: true,
    type: 'module',
    engines: { node: '>=22' }
  });
  assert.deepEqual(
    project.files.map((file) => file.path),
    ['README.md', 'src/index.ts']
  );
  assert.equal(project.warnings.length, 1);
  assert.match(project.warnings[0] ?? '', /no package\.json/);
});

test('static templates exclude repository metadata and reject symlinks', async (t) => {
  const root = await tempDir(t);
  await fsp.mkdir(path.join(root, '.git'), { recursive: true });
  await fsp.writeFile(path.join(root, '.git', 'config'), 'gitdir\n');
  await fsp.mkdir(path.join(root, 'node_modules'), { recursive: true });
  await fsp.writeFile(path.join(root, 'node_modules', 'x.js'), 'x\n');
  await fsp.writeFile(path.join(root, '.DS_Store'), 'junk\n');
  await fsp.writeFile(path.join(root, 'keep.txt'), 'keep\n');
  await fsp.writeFile(
    path.join(root, 'package.json'),
    '{"name":"ignored","plugins":[]}\n'
  );

  const plan = createPlan({
    packageName: 'metadata-app',
    template: root
  });
  const prepared = await prepareTemplateSource(plan);
  const project = await resolveTemplateProject(prepared, plan);
  assert.deepEqual(
    project.files.map((file) => file.path),
    ['keep.txt']
  );
  assert.equal(project.packageJson.name, 'metadata-app');

  const symlinkRoot = await copyFixture(t, 'static-basic');
  try {
    await fsp.symlink('README.md', path.join(symlinkRoot, 'link.md'));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EPERM' || code === 'EACCES' || code === 'UNKNOWN') {
      t.diagnostic(`symlinks are not available on this system (${code})`);
      return;
    }
    throw error;
  }
  const symlinkPlan = createPlan({
    packageName: 'symlink-app',
    template: symlinkRoot
  });
  const symlinkPrepared = await prepareTemplateSource(symlinkPlan);
  await assertCliAsync(
    resolveTemplateProject(symlinkPrepared, symlinkPlan),
    'PREFLIGHT',
    /symbolic link/
  );
});

test('static templates preserve binary bytes and validate package fields', async (t) => {
  const root = await tempDir(t);
  const bytes = Uint8Array.from([0, 1, 2, 3, 255, 254]);
  await fsp.writeFile(path.join(root, 'data.bin'), bytes);
  await fsp.writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({
      name: 'original',
      private: false,
      type: 'commonjs',
      scripts: { 'test:unit': 'node --test' },
      dependencies: { pg: '8.16.3' }
    })
  );

  const plan = createPlan({
    packageName: 'binary-app',
    template: root
  });
  const prepared = await prepareTemplateSource(plan);
  const project = await resolveTemplateProject(prepared, plan);
  assert.deepEqual(
    [...bytesFile(project, 'data.bin')],
    [...bytes]
  );
  assert.deepEqual(project.packageJson.scripts, {
    'test:unit': 'node --test'
  });
  assert.deepEqual(project.packageJson.dependencies, { pg: '8.16.3' });

  const badRoot = await tempDir(t);
  await fsp.writeFile(path.join(badRoot, 'package.json'), '{not json}\n');
  const badPlan = createPlan({
    packageName: 'bad-app',
    template: badRoot
  });
  const badPrepared = await prepareTemplateSource(badPlan);
  await assertCliAsync(
    resolveTemplateProject(badPrepared, badPlan),
    'GENERATION',
    /not valid JSON/
  );

  const badPluginsRoot = await tempDir(t);
  await fsp.writeFile(
    path.join(badPluginsRoot, 'package.json'),
    '{"plugins":[1]}\n'
  );
  const badPluginsPlan = createPlan({
    packageName: 'bad-plugins-app',
    template: badPluginsRoot
  });
  const badPluginsPrepared = await prepareTemplateSource(badPluginsPlan);
  await assertCliAsync(
    resolveTemplateProject(badPluginsPrepared, badPluginsPlan),
    'GENERATION',
    /plugins.*array of strings/
  );

  const badDependencyRoot = await tempDir(t);
  await fsp.writeFile(
    path.join(badDependencyRoot, 'package.json'),
    '{"dependencies":{"pg":8}}\n'
  );
  const badDependencyPlan = createPlan({
    packageName: 'bad-dependency-app',
    template: badDependencyRoot
  });
  const badDependencyPrepared = await prepareTemplateSource(
    badDependencyPlan
  );
  await assertCliAsync(
    resolveTemplateProject(badDependencyPrepared, badDependencyPlan),
    'GENERATION',
    /must be a string/
  );
});

test('static template limits are enforced', async () => {
  const plan = createPlan({
    packageName: 'limited-app',
    template: path.join(fixtureRoot, 'static-basic')
  });
  const prepared = await prepareTemplateSource(plan, {
    limits: { maxFileCount: 2 }
  });
  await assertCliAsync(
    resolveTemplateProject(prepared, plan),
    'PREFLIGHT',
    /more than 2 files/
  );
});

test('prepareTemplateSource validates local paths and plans', async (t) => {
  const missing = path.join(await tempDir(t), 'missing');
  await assertCliAsync(
    prepareTemplateSource(
      createPlan({ template: missing })
    ),
    'USAGE',
    /not found/
  );

  const root = await tempDir(t);
  const file = path.join(root, 'file.txt');
  await fsp.writeFile(file, 'not a directory\n');
  await assertCliAsync(
    prepareTemplateSource(createPlan({ template: file })),
    'USAGE',
    /not a directory/
  );

  await assertCliAsync(
    prepareTemplateSource(createPlan()),
    'USAGE',
    /No template source/
  );

  const symlinkRoot = path.join(await tempDir(t), 'template-link');
  try {
    await fsp.symlink(
      path.join(fixtureRoot, 'static-basic'),
      symlinkRoot,
      'junction'
    );
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EPERM' || code === 'EACCES' || code === 'UNKNOWN') {
      t.diagnostic(`directory links are not available on this system (${code})`);
      return;
    }
    throw error;
  }
  await assertCliAsync(
    prepareTemplateSource(createPlan({ template: symlinkRoot })),
    'USAGE',
    /symbolic link/
  );
});
