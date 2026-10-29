import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatPlanSummary,
  getInteractionMode,
  isAgentEnvironment,
  isCi,
  resolveCreateOptions,
  type InteractionContext
} from '../../src/create/interaction.js';
import type {
  PromptAdapter,
  SelectPromptOptions
} from '../../src/create/prompts.js';
import { CliError } from '../../src/errors.js';

type Answer = string | boolean | symbol;

function fakePrompts(answers: Answer[]) {
  const calls: string[] = [];
  const adapter: PromptAdapter = {
    text: async (options) => {
      calls.push(options.message);
      return answers.shift() as string | symbol;
    },
    select: async <T extends string>(options: SelectPromptOptions<T>) => {
      calls.push(options.message);
      return answers.shift() as T | symbol;
    },
    confirm: async (options) => {
      calls.push(options.message);
      return answers.shift() as boolean | symbol;
    },
    note: (_message, title) => {
      calls.push(`note:${title}`);
    },
    cancel: (message) => {
      calls.push(`cancel:${message}`);
    },
    isCancel: (value) => typeof value === 'symbol'
  };
  return { adapter, calls };
}

function ttyContext(overrides: Partial<InteractionContext> = {}): InteractionContext {
  return {
    env: {},
    streams: {
      stdin: { isTTY: true },
      stdout: { isTTY: true }
    },
    detectPackageManager: () => 'npm',
    ...overrides
  };
}

test('interaction mode respects TTY, CI, yes, no-input, and agents', () => {
  assert.equal(getInteractionMode({}, ttyContext()), 'interactive');
  assert.equal(getInteractionMode({}, ttyContext({ env: { CI: '1' } })), 'non-interactive');
  assert.equal(getInteractionMode({}, ttyContext({ env: { CI: 'false' } })), 'interactive');
  assert.equal(getInteractionMode({ yes: true }, ttyContext()), 'yes');
  assert.equal(getInteractionMode({ noInput: true }, ttyContext()), 'non-interactive');
  assert.equal(
    getInteractionMode({}, ttyContext({ env: { CLAUDECODE: '1' } })),
    'non-interactive'
  );
  assert.equal(
    getInteractionMode({}, {
      env: {},
      streams: { stdin: { isTTY: false }, stdout: { isTTY: true } }
    }),
    'non-interactive'
  );
});

test('CI and agent detection are explicit', () => {
  assert.equal(isCi({ CI: 'true' }), true);
  assert.equal(isCi({ CI: '0' }), false);
  assert.equal(isCi({ CI: 'false' }), false);
  assert.equal(isAgentEnvironment({ OPENCODE: '1' }), true);
  assert.equal(isAgentEnvironment({}), false);
});

test('non-interactive mode requires a directory', async () => {
  await assert.rejects(
    () => resolveCreateOptions({}, {
      env: {},
      streams: { stdin: { isTTY: false }, stdout: { isTTY: false } }
    }),
    (error: unknown) => error instanceof CliError && error.code === 'USAGE'
  );
});

test('yes mode uses install and git defaults', async () => {
  const resolved = await resolveCreateOptions({ directory: 'my-app', yes: true }, {
    env: {},
    streams: { stdin: { isTTY: false }, stdout: { isTTY: false } },
    detectPackageManager: () => 'pnpm'
  });

  assert.ok(resolved);
  assert.equal(resolved.type, 'full-stack');
  assert.equal(resolved.database, 'pglite');
  assert.equal(resolved.packageManager, 'pnpm');
  assert.equal(resolved.install, true);
  assert.equal(resolved.git, true);
});

test('non-interactive mode defaults to scaffold only', async () => {
  const resolved = await resolveCreateOptions({ directory: 'my-app' }, {
    env: {},
    streams: { stdin: { isTTY: false }, stdout: { isTTY: false } },
    detectPackageManager: () => 'npm'
  });

  assert.ok(resolved);
  assert.equal(resolved.install, false);
  assert.equal(resolved.git, false);
});

test('interactive mode asks in order and returns the plan', async () => {
  const { adapter, calls } = fakePrompts([
    'my-app',
    'api-only',
    'postgres',
    'pnpm',
    false,
    true,
    true
  ]);

  const resolved = await resolveCreateOptions({}, ttyContext({ prompts: adapter }));

  assert.ok(resolved);
  assert.equal(resolved.directory, 'my-app');
  assert.equal(resolved.type, 'api-only');
  assert.equal(resolved.database, 'postgres');
  assert.equal(resolved.packageManager, 'pnpm');
  assert.equal(resolved.install, false);
  assert.equal(resolved.git, true);
  assert.deepEqual(calls, [
    'Where should the project be created?',
    'Project type',
    'Database',
    'Package manager',
    'Install dependencies?',
    'Initialize git?',
    'note:Create project',
    'Create this project?'
  ]);
});

test('declining the plan returns null', async () => {
  const { adapter } = fakePrompts([
    'my-app',
    'full-stack',
    'pglite',
    'npm',
    true,
    true,
    false
  ]);

  const resolved = await resolveCreateOptions({}, ttyContext({ prompts: adapter }));
  assert.equal(resolved, null);
});

test('cancelling a prompt raises an interrupted error', async () => {
  const cancel = Symbol('cancel');
  const { adapter } = fakePrompts([cancel]);

  await assert.rejects(
    () => resolveCreateOptions({}, ttyContext({ prompts: adapter })),
    (error: unknown) => error instanceof CliError && error.code === 'INTERRUPTED'
  );
});

test('provided options skip matching prompts', async () => {
  const { adapter, calls } = fakePrompts([true]);

  const resolved = await resolveCreateOptions({
    directory: 'my-app',
    type: 'minimal',
    database: 'sqlite',
    packageManager: 'yarn',
    install: false,
    git: false
  }, ttyContext({ prompts: adapter }));

  assert.ok(resolved);
  assert.equal(resolved.type, 'minimal');
  assert.equal(resolved.database, 'sqlite');
  assert.equal(resolved.packageManager, 'yarn');
  assert.deepEqual(calls, ['note:Create project', 'Create this project?']);
});

test('plan summary includes the selected values', () => {
  const summary = formatPlanSummary({
    directory: 'my-app',
    type: 'api-only',
    database: 'cockroachdb',
    packageManager: 'pnpm',
    install: false,
    git: true,
    overwrite: false,
    dryRun: false,
    noColor: true,
    noAgentsMd: false
  });

  assert.match(summary, /Target: my-app/);
  assert.match(summary, /Type: API-only/);
  assert.match(summary, /CockroachDB/);
  assert.match(summary, /Package manager: pnpm/);
  assert.match(summary, /Install: no/);
  assert.match(summary, /Git: yes/);
});
