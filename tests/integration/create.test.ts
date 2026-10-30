import assert from 'node:assert/strict';
import { existsSync, promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, test } from 'node:test';
import { buildCreatePlan } from '../../src/create/plan.js';
import {
  runCreate,
  type CreateWorkflowDependencies,
  type RunCreateOptions
} from '../../src/create/workflow.js';
import type { ResolvedCreateOptions } from '../../src/create/interaction.js';
import { CliError, exitCodeForError } from '../../src/errors.js';
import { createOutput } from '../../src/output.js';
import type { CreatePlan } from '../../src/types.js';

const DEFAULT_RESOLVED: ResolvedCreateOptions = {
  directory: 'my-app',
  type: 'full-stack',
  database: 'pglite',
  packageManager: 'npm',
  install: false,
  git: false,
  overwrite: false,
  dryRun: false,
  noColor: true,
  noAgentsMd: false
};

const FULL_STACK_PGLITE_FILES = [
  '.env.sample',
  '.gitignore',
  'AGENTS.md',
  'README.md',
  'config/build.ts',
  'config/client.ts',
  'config/common.ts',
  'config/develop.ts',
  'package.json',
  'plugins/app/pages/home.ts',
  'plugins/app/plugin.ts',
  'plugins/app/views/home.tsx',
  'plugins/store/connect.ts',
  'plugins/store/plugin.ts',
  'plugins/store/populate.ts',
  'schema.idea',
  'scripts/stackpress.ts',
  'tsconfig.json',
  'uno.config.ts'
];

const API_ONLY_POSTGRES_FILES = [...FULL_STACK_PGLITE_FILES];

const TEMPLATE_FIXTURES = fileURLToPath(
  new URL('../fixtures/templates', import.meta.url)
);

const roots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'create-workflow-'));
  roots.push(root);
  return root;
}

afterEach(async () => {
  const pending = roots.splice(0);
  await Promise.all(
    pending.map((root) => fsp.rm(root, { recursive: true, force: true }))
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
  cwd: string,
  directory: string,
  overrides: Partial<ResolvedCreateOptions> = {}
): CreatePlan {
  return buildCreatePlan(
    { ...DEFAULT_RESOLVED, ...overrides, directory },
    { cwd }
  );
}

async function runWorkflow(
  plan: CreatePlan,
  overrides: Partial<RunCreateOptions> = {}
) {
  const stdout = memoryStream();
  const stderr = memoryStream();
  const output = createOutput({
    stdout,
    stderr,
    env: {},
    noColor: true
  });
  const result = await runCreate({
    plan,
    cwd: path.dirname(plan.targetDir),
    env: {},
    output,
    commandExists: () => true,
    ...overrides
  });
  return {
    result,
    stdout: stdout.text(),
    stderr: stderr.text()
  };
}

async function expectWorkflowError(
  plan: CreatePlan,
  overrides: Partial<RunCreateOptions> = {}
): Promise<CliError> {
  try {
    await runWorkflow(plan, overrides);
  } catch (error) {
    assert.ok(error instanceof CliError);
    return error;
  }
  assert.fail('Expected create to fail.');
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

async function readJson(filePath: string): Promise<Record<string, any>> {
  return JSON.parse(await fsp.readFile(filePath, 'utf8')) as Record<string, any>;
}

test('generates a full-stack/PGlite project with documentation and next steps', async () => {
  const root = await tempRoot();
  const target = path.join(root, 'full-stack-app');
  const plan = makePlan(root, 'full-stack-app', {
    type: 'full-stack',
    database: 'pglite',
    packageManager: 'pnpm'
  });

  const { result, stdout, stderr } = await runWorkflow(plan, { cwd: root });

  assert.equal(result.installed, false);
  assert.equal(result.gitInitialized, false);
  assert.deepEqual(await listFiles(target), FULL_STACK_PGLITE_FILES);

  const packageJson = await readJson(path.join(target, 'package.json'));
  assert.equal(packageJson.name, 'full-stack-app');
  assert.equal(packageJson.private, true);
  assert.equal(packageJson.type, 'module');
  assert.deepEqual(packageJson.engines, { node: '>=22' });
  assert.deepEqual(Object.keys(packageJson.scripts).sort(), [
    'build',
    'dev',
    'generate',
    'push'
  ]);
  assert.equal(packageJson.dependencies.stackpress, '0.10.8');
  assert.equal(packageJson.dependencies['@stackpress/ingest'], '0.10.8');
  assert.equal(packageJson.dependencies['stackpress-server'], '0.10.8');
  assert.equal(packageJson.dependencies['@electric-sql/pglite'], '0.3.15');
  assert.equal(packageJson.dependencies['@stackpress/inquire-pglite'], '0.10.8');
  assert.equal(packageJson.dependencies.react, '19.2.4');
  assert.equal(packageJson.devDependencies['@types/react'], '19.2.14');
  assert.equal(packageJson.devDependencies['ts-morph'], '27.0.2');
  assert.deepEqual(packageJson.plugins, [
    'plugins/app/plugin',
    'plugins/store/plugin',
    'stackpress'
  ]);

  const gitignore = await fsp.readFile(path.join(target, '.gitignore'), 'utf8');
  assert.match(gitignore, /node_modules\//);
  assert.match(gitignore, /\.env/);

  assert.match(
    stdout,
    /\(views, admin, api, auth, content, database\)/
  );

  const readme = await fsp.readFile(path.join(target, 'README.md'), 'utf8');
  assert.match(readme, /pnpm install/);
  assert.match(readme, /pnpm run dev/);
  assert.doesNotMatch(readme, /\bnpm install\b/);
  assert.doesNotMatch(readme, /\bnpm run\b/);

  const agents = await fsp.readFile(path.join(target, 'AGENTS.md'), 'utf8');
  assert.match(agents, /pnpm run dev/);
  assert.match(agents, /pnpm run generate/);
  assert.doesNotMatch(agents, /\bnpm run\b/);

  assert.deepEqual(result.nextSteps, [
    `cd ${target}`,
    'pnpm install',
    'pnpm run generate',
    'pnpm run push',
    'pnpm run dev',
    'git init',
    'git add .',
    'git commit -m "Initial commit"'
  ]);
  for (const step of result.nextSteps) {
    assert.ok(stdout.includes(step), `stdout should include "${step}"`);
  }
  assert.match(stdout, /Files: 19/);
  assert.match(stdout, /Pinned versions: stackpress 0\.10\.8/);
  assert.match(stdout, /@electric-sql\/pglite 0\.3\.15/);
  assert.match(stdout, /PGlite runs locally; no database server is required/);
  assert.equal(stderr, '');
});

test('generates an API-only/Postgres project with pinned versions', async () => {
  const root = await tempRoot();
  const target = path.join(root, 'api-app');
  const plan = makePlan(root, 'api-app', {
    type: 'api-only',
    database: 'postgres',
    packageManager: 'npm'
  });

  const { result, stdout } = await runWorkflow(plan, { cwd: root });

  assert.deepEqual(await listFiles(target), API_ONLY_POSTGRES_FILES);

  const packageJson = await readJson(path.join(target, 'package.json'));
  assert.equal(packageJson.name, 'api-app');
  assert.equal(packageJson.dependencies['@stackpress/inquire-pg'], '0.10.8');
  assert.equal(packageJson.dependencies.pg, '8.16.3');
  assert.equal(packageJson.devDependencies['@types/pg'], '8.16.0');
  assert.deepEqual(packageJson.plugins, [
    'plugins/app/plugin',
    'plugins/store/plugin',
    'stackpress'
  ]);

  assert.match(stdout, /\(api, auth, database\)/);

  const envSample = await fsp.readFile(
    path.join(target, '.env.sample'),
    'utf8'
  );
  assert.match(
    envSample,
    /DATABASE_URL=postgres:\/\/postgres:postgres@localhost:5432\/app/
  );

  assert.deepEqual(result.nextSteps.slice(0, 5), [
    `cd ${target}`,
    'npm install',
    'npm run generate',
    'npm run push',
    'npm run dev'
  ]);
  assert.match(stdout, /pg 8\.16\.3/);
  assert.match(stdout, /PostgreSQL must be running and reachable/);
  assert.match(
    stdout,
    /Expected DATABASE_URL: postgres:\/\/postgres:postgres@localhost:5432\/app/
  );
});

test('dry run prints the plan and file list without writing', async () => {
  const root = await tempRoot();
  const target = path.join(root, 'dry-run-app');
  const plan = makePlan(root, 'dry-run-app', { dryRun: true });

  const { result, stdout, stderr } = await runWorkflow(plan, { cwd: root });

  assert.equal(existsSync(target), false);
  assert.deepEqual(await fsp.readdir(root), []);
  assert.equal(result.installed, false);
  assert.equal(result.gitInitialized, false);
  assert.deepEqual(result.nextSteps, []);
  assert.match(stdout, /Mode: dry run \(no files will be written\)/);
  assert.match(stdout, /Files: 19/);
  assert.match(stdout, /^\s+package\.json$/m);
  assert.match(stdout, /^\s+README\.md$/m);
  assert.doesNotMatch(stdout, /Created /);
  assert.equal(stderr, '');
});

test('non-empty targets require --overwrite and preserve unrelated files', async () => {
  const root = await tempRoot();
  const target = path.join(root, 'existing-app');
  await fsp.mkdir(target);
  await fsp.writeFile(path.join(target, 'keep.txt'), 'keep\n');

  const plan = makePlan(root, 'existing-app');
  const error = await expectWorkflowError(plan, { cwd: root });

  assert.equal(error.code, 'PREFLIGHT');
  assert.equal(error.exitCode, 2);
  assert.match(error.message, /not empty/);
  assert.match(error.hint ?? '', /--overwrite/);
  assert.deepEqual((await fsp.readdir(target)).sort(), ['keep.txt']);

  const overwritePlan = makePlan(root, 'existing-app', { overwrite: true });
  const { result } = await runWorkflow(overwritePlan, { cwd: root });

  assert.equal(result.installed, false);
  assert.equal(
    await fsp.readFile(path.join(target, 'keep.txt'), 'utf8'),
    'keep\n'
  );
  assert.ok(existsSync(path.join(target, 'package.json')));
  assert.ok(existsSync(path.join(target, 'README.md')));
  assert.match(
    await fsp.readFile(path.join(target, '.gitignore'), 'utf8'),
    /node_modules\//
  );
  assert.deepEqual((await fsp.readdir(root)).sort(), ['existing-app']);
});

test('--db-url writes .env and the URL never appears in output', async () => {
  const root = await tempRoot();
  const target = path.join(root, 'secret-app');
  const databaseUrl = 'postgres://alice:s3cr3t@db.example:5432/app';
  const plan = makePlan(root, 'secret-app', {
    type: 'api-only',
    database: 'postgres'
  });

  const { stdout, stderr } = await runWorkflow(plan, {
    cwd: root,
    databaseUrl
  });

  assert.equal(
    await fsp.readFile(path.join(target, '.env'), 'utf8'),
    `DATABASE_URL=${databaseUrl}\n`
  );
  const combined = `${stdout}${stderr}`;
  assert.equal(combined.includes(databaseUrl), false);
  assert.equal(combined.includes('s3cr3t'), false);
  assert.match(
    stdout,
    /Expected DATABASE_URL: postgres:\/\/postgres:postgres@localhost:5432\/app/
  );

  const envSample = await fsp.readFile(
    path.join(target, '.env.sample'),
    'utf8'
  );
  assert.equal(envSample.includes('s3cr3t'), false);
});

test('--db-url rejects control characters without echoing the value', async () => {
  const root = await tempRoot();
  const target = path.join(root, 'unsafe-url-app');
  const plan = makePlan(root, 'unsafe-url-app', {
    type: 'api-only',
    database: 'postgres'
  });

  const error = await expectWorkflowError(plan, {
    cwd: root,
    databaseUrl: 'postgres://user:s3cr3t\nINJECTED=1'
  });

  assert.equal(error.code, 'USAGE');
  assert.doesNotMatch(error.message, /s3cr3t/);
  assert.doesNotMatch(error.hint ?? '', /s3cr3t/);
  assert.equal(existsSync(target), false);
});

test('--db-url is written verbatim without token scanning or logging', async () => {
  const root = await tempRoot();
  const target = path.join(root, 'token-url-app');
  const databaseUrl = 'postgres://user:{{secret}}@db.example:5432/app';
  const plan = makePlan(root, 'token-url-app', {
    type: 'api-only',
    database: 'postgres'
  });

  const { stdout, stderr } = await runWorkflow(plan, {
    cwd: root,
    databaseUrl
  });

  assert.equal(
    await fsp.readFile(path.join(target, '.env'), 'utf8'),
    `DATABASE_URL=${databaseUrl}\n`
  );
  const combined = `${stdout}${stderr}`;
  assert.equal(combined.includes(databaseUrl), false);
  assert.equal(combined.includes('{{secret}}'), false);
});

test('--no-agents-md omits AGENTS.md', async () => {
  const root = await tempRoot();
  const target = path.join(root, 'no-agents-app');
  const plan = makePlan(root, 'no-agents-app', { noAgentsMd: true });

  await runWorkflow(plan, { cwd: root });

  assert.equal(existsSync(path.join(target, 'AGENTS.md')), false);
  assert.deepEqual(
    await listFiles(target),
    FULL_STACK_PGLITE_FILES.filter((file) => file !== 'AGENTS.md')
  );
});

test('minimal projects run dev without generate or push', async () => {
  const root = await tempRoot();
  const target = path.join(root, 'minimal-app');
  const plan = makePlan(root, 'minimal-app', {
    type: 'minimal',
    install: true,
    git: true
  });
  const calls: string[] = [];
  const dependencies: CreateWorkflowDependencies = {
    install: async (context) => {
      calls.push(`install:${context.targetDir}`);
      return { installed: true };
    },
    git: async (context) => {
      calls.push(`git:${context.targetDir}`);
      return { initialized: true };
    }
  };

  const { result, stdout } = await runWorkflow(plan, {
    cwd: root,
    dependencies
  });

  assert.equal(result.installed, true);
  assert.equal(result.gitInitialized, true);
  assert.deepEqual(result.nextSteps, [`cd ${target}`, 'npm run dev']);
  assert.deepEqual(calls, [`install:${target}`, `git:${target}`]);
  assert.doesNotMatch(stdout, /run generate/);
  assert.doesNotMatch(stdout, /run push/);
});

test('install without an injected implementation fails with a --no-install hint', async () => {
  const root = await tempRoot();
  const target = path.join(root, 'install-app');
  const plan = makePlan(root, 'install-app', { install: true });

  const error = await expectWorkflowError(plan, { cwd: root });

  assert.equal(error.code, 'INSTALL');
  assert.equal(error.exitCode, 1);
  assert.match(error.message, /No install implementation was provided/);
  assert.match(error.hint ?? '', /--no-install/);
  assert.equal(existsSync(target), false);
});

test('missing git is a warning that skips git and keeps success', async () => {
  const root = await tempRoot();
  const target = path.join(root, 'no-git-app');
  const plan = makePlan(root, 'no-git-app', { git: true });

  const { result, stderr } = await runWorkflow(plan, {
    cwd: root,
    commandExists: (command) => command !== 'git'
  });

  assert.equal(result.gitInitialized, false);
  assert.equal(existsSync(path.join(target, 'package.json')), true);
  assert.match(stderr, /git was not found/);
  assert.ok(
    result.nextSteps.includes('git init'),
    'skipped git should print the manual commands'
  );
});

test('creates a project from a local static template', async () => {
  const root = await tempRoot();
  const target = path.join(root, 'static-app');
  const plan = makePlan(root, 'static-app', {
    template: path.join(TEMPLATE_FIXTURES, 'static-basic')
  });

  const { result, stdout } = await runWorkflow(plan, {
    cwd: root,
    explicitType: false,
    explicitDatabase: false
  });

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
  assert.match(stdout, /static copy; type\/database not verified/);
  assert.ok(result.nextSteps.includes('npm run dev'));
  assert.equal(result.nextSteps.includes('npm run generate'), false);
  assert.equal(result.nextSteps.includes('npm run push'), false);
});

test('rejects explicit --type or --db for a static template', async () => {
  const root = await tempRoot();
  const target = path.join(root, 'static-explicit');
  const plan = makePlan(root, 'static-explicit', {
    template: path.join(TEMPLATE_FIXTURES, 'static-basic'),
    type: 'full-stack',
    database: 'pglite'
  });

  const error = await expectWorkflowError(plan, {
    cwd: root,
    explicitType: true,
    explicitDatabase: true
  });

  assert.equal(error.code, 'USAGE');
  assert.equal(exitCodeForError(error), 2);
  assert.match(error.message, /cannot be verified/);
  assert.equal(existsSync(target), false);
});

test('creates a project from a local manifest template', async () => {
  const root = await tempRoot();
  const target = path.join(root, 'manifest-app');
  const plan = makePlan(root, 'manifest-app', {
    type: 'api-only',
    database: 'postgres',
    template: path.join(TEMPLATE_FIXTURES, 'manifest-basic')
  });

  const { result, stdout } = await runWorkflow(plan, {
    cwd: root,
    explicitType: true,
    explicitDatabase: true
  });

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
  assert.equal(packageJson.dependencies['base-dep'], '2.0.0');
  assert.equal(packageJson.dependencies['manifest-extra'], '1.0.0');
  assert.match(stdout, /manifest-basic/);
  assert.equal(result.nextSteps.includes('npm run dev'), false);
  assert.ok(result.nextSteps.includes('npm install'));
});

test('rejects an unsupported manifest template type before writing', async () => {
  const root = await tempRoot();
  const target = path.join(root, 'unsupported-template');
  const plan = makePlan(root, 'unsupported-template', {
    type: 'full-stack',
    database: 'pglite',
    template: path.join(TEMPLATE_FIXTURES, 'manifest-basic')
  });

  const error = await expectWorkflowError(plan, {
    cwd: root,
    explicitType: true,
    explicitDatabase: true
  });

  assert.equal(error.code, 'USAGE');
  assert.match(error.message, /does not support project type "full-stack"/);
  assert.equal(existsSync(target), false);
});

test('rejects --db-url with a custom template', async () => {
  const root = await tempRoot();
  const target = path.join(root, 'template-db-url');
  const plan = makePlan(root, 'template-db-url', {
    template: path.join(TEMPLATE_FIXTURES, 'static-basic')
  });

  const error = await expectWorkflowError(plan, {
    cwd: root,
    databaseUrl: 'postgres://user:secret@example.test/app'
  });

  assert.equal(error.code, 'USAGE');
  assert.match(error.message, /--db-url is not supported with --template/);
  assert.equal(existsSync(target), false);
});
