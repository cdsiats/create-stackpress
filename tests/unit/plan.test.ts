import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { rewritePackageManagerCommands } from '../../src/create/documents.js';
import type { ResolvedCreateOptions } from '../../src/create/interaction.js';
import {
  buildNextSteps,
  describeDatabasePrerequisite
} from '../../src/create/next-steps.js';
import {
  buildCreatePlan,
  derivePackageName,
  inferPackageManagerSource,
  resolveTargetDir
} from '../../src/create/plan.js';
import { validatePackageName } from '../../src/create/preflight.js';
import { CliError, exitCodeForError } from '../../src/errors.js';
import type { CreatePlan } from '../../src/types.js';

const RESOLVED: ResolvedCreateOptions = {
  directory: 'my-app',
  type: 'api-only',
  database: 'postgres',
  packageManager: 'pnpm',
  install: true,
  git: true,
  template: undefined,
  databaseUrl: 'postgres://user:secret@example/app',
  overwrite: true,
  dryRun: false,
  noColor: true,
  noAgentsMd: true
};

function plan(overrides: Partial<CreatePlan> = {}): CreatePlan {
  return {
    targetDir: '/tmp/my-app',
    packageName: 'my-app',
    type: 'full-stack',
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

test('builds an absolute plan from resolved options', () => {
  const cwd = path.resolve('/tmp', 'workspace');
  const created = buildCreatePlan(RESOLVED, { cwd });

  assert.equal(created.targetDir, path.join(cwd, 'my-app'));
  assert.equal(created.packageName, 'my-app');
  assert.equal(created.type, 'api-only');
  assert.equal(created.database, 'postgres');
  assert.equal(created.packageManager, 'pnpm');
  assert.equal(created.install, true);
  assert.equal(created.git, true);
  assert.equal(created.overwrite, true);
  assert.equal(created.dryRun, false);
  assert.equal(created.noAgentsMd, true);
});

test('derives the package name from a dot target', () => {
  const cwd = path.resolve('/tmp', 'workspace', 'dot-app');
  const created = buildCreatePlan({ ...RESOLVED, directory: '.' }, { cwd });

  assert.equal(created.targetDir, cwd);
  assert.equal(created.packageName, 'dot-app');
  assert.equal(derivePackageName(path.join(cwd, 'nested')), 'nested');
  assert.equal(resolveTargetDir('..', cwd), path.dirname(cwd));
});

test('validates npm package names', () => {
  for (const name of ['my-app', 'app2', '@scope/app', 'a.b_c~d']) {
    assert.equal(validatePackageName(name), undefined, name);
  }

  for (const name of [
    '',
    'My-App',
    '.hidden',
    '_private',
    'two words',
    'node_modules',
    'favicon.ico',
    'a'.repeat(215)
  ]) {
    assert.ok(validatePackageName(name), `expected "${name}" to be invalid`);
  }
});

test('infers the package-manager source label', () => {
  assert.equal(
    inferPackageManagerSource('pnpm', {
      npm_config_user_agent: 'pnpm/9.0.0 npm/? node/v22.0.0'
    }),
    'detected from npm_config_user_agent'
  );
  assert.equal(inferPackageManagerSource('npm', {}), 'npm fallback');
  assert.equal(inferPackageManagerSource('yarn', {}), 'selected');
});

test('builds next steps for each preset and install/git state', () => {
  assert.deepEqual(
    buildNextSteps(plan({ packageManager: 'pnpm' }), {
      installed: false,
      gitInitialized: false
    }),
    [
      'cd /tmp/my-app',
      'pnpm install',
      'pnpm run generate',
      'pnpm run push',
      'pnpm run dev',
      'git init',
      'git add .',
      'git commit -m "Initial commit"'
    ]
  );

  assert.deepEqual(
    buildNextSteps(plan({ type: 'minimal', packageManager: 'yarn' }), {
      installed: true,
      gitInitialized: true
    }),
    ['cd /tmp/my-app', 'yarn run dev']
  );
});

test('describes database prerequisites without user URLs', () => {
  assert.match(
    describeDatabasePrerequisite('pglite'),
    /no database server is required/
  );
  assert.match(
    describeDatabasePrerequisite('postgres'),
    /Expected DATABASE_URL: postgres:\/\/postgres:postgres@localhost:5432\/app/
  );
  assert.match(
    describeDatabasePrerequisite('sqlite'),
    /Expected DATABASE_URL: \.\/\.build\/database\.sqlite/
  );
});

test('rewrites npm commands in documentation for the selected package manager', () => {
  const input = [
    'Run npm install, then npm run dev.',
    'Use npm run generate and npm run push.'
  ].join('\n');

  assert.equal(
    rewritePackageManagerCommands(input, 'bun'),
    [
      'Run bun install, then bun run dev.',
      'Use bun run generate and bun run push.'
    ].join('\n')
  );
  assert.equal(rewritePackageManagerCommands(input, 'npm'), input);
  assert.equal(
    rewritePackageManagerCommands('npm package conventions', 'pnpm'),
    'npm package conventions'
  );
});

test('maps usage and cancellation error codes', () => {
  assert.equal(exitCodeForError(CliError.usage('bad flag')), 2);
  assert.equal(exitCodeForError(CliError.interrupted()), 130);
  assert.equal(exitCodeForError(new Error('unexpected')), 1);
});
