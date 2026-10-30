import assert from 'node:assert/strict';
import { existsSync, promises as fsp } from 'node:fs';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { buildCreatePlan } from '../../src/create/plan.js';
import { resolveCreateOptions } from '../../src/create/interaction.js';
import type { ResolvedCreateOptions } from '../../src/create/interaction.js';
import type { PromptAdapter } from '../../src/create/prompts.js';
import {
  runCreate,
  type CreateWorkflowDependencies,
  type RunCreateOptions
} from '../../src/create/workflow.js';
import { CliError } from '../../src/errors.js';
import { createOutput } from '../../src/output.js';
import { writeProject as writeResolvedProject } from '../../src/template/write.js';
import type { CreatePlan } from '../../src/types.js';
import {
  cleanupTempRoots,
  temporaryEntries,
  tempRoot
} from './helpers.js';

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

afterEach(async () => {
  await cleanupTempRoots();
});

test('dry run prints the plan and writes nothing', async () => {
  const root = await tempRoot();
  const target = path.join(root, 'dry-run-app');
  const plan = makePlan(root, 'dry-run-app', { dryRun: true });

  const { result, stdout, stderr } = await runWorkflow(plan, { cwd: root });

  assert.equal(existsSync(target), false);
  assert.deepEqual(await fsp.readdir(root), []);
  assert.deepEqual(result.nextSteps, []);
  assert.match(stdout, /Mode: dry run \(no files will be written\)/);
  assert.match(stdout, /Files: \d+/);
  assert.match(stdout, /^\s+package\.json$/m);
  assert.doesNotMatch(stdout, /Created /);
  assert.equal(stderr, '');
});

test('overwrite replaces conflicts and preserves unrelated files', async () => {
  const root = await tempRoot();
  const target = path.join(root, 'existing-app');
  await fsp.mkdir(path.join(target, 'config'), { recursive: true });
  await fsp.writeFile(path.join(target, 'keep.txt'), 'keep\n');
  await fsp.writeFile(path.join(target, 'README.md'), 'old readme\n');
  await fsp.writeFile(
    path.join(target, 'config', 'unrelated.json'),
    '{"unrelated":true}\n'
  );

  const plan = makePlan(root, 'existing-app', { overwrite: true });
  const { result } = await runWorkflow(plan, { cwd: root });

  assert.equal(await fsp.readFile(path.join(target, 'keep.txt'), 'utf8'), 'keep\n');
  assert.equal(
    await fsp.readFile(path.join(target, 'config', 'unrelated.json'), 'utf8'),
    '{"unrelated":true}\n'
  );
  const readme = await fsp.readFile(path.join(target, 'README.md'), 'utf8');
  assert.match(readme, /# existing-app/);
  assert.doesNotMatch(readme, /old readme/);
  assert.ok(existsSync(path.join(target, 'package.json')));
  assert.deepEqual(await temporaryEntries(root), []);
  assert.ok(result.nextSteps.includes(`cd ${target}`));
});

test('declining the interactive confirmation leaves no target', async () => {
  const root = await tempRoot();
  const prompts: PromptAdapter = {
    text: async () => {
      throw new Error('unexpected text prompt');
    },
    select: async () => {
      throw new Error('unexpected select prompt');
    },
    confirm: async () => false,
    note: () => undefined,
    cancel: () => undefined,
    isCancel: (value) => typeof value === 'symbol'
  };

  const resolved = await resolveCreateOptions(
    {
      directory: 'cancelled-app',
      type: 'full-stack',
      database: 'pglite',
      packageManager: 'npm',
      install: false,
      git: false
    },
    {
      env: {},
      streams: {
        stdin: { isTTY: true },
        stdout: { isTTY: true }
      },
      prompts,
      detectPackageManager: () => 'npm'
    }
  );

  assert.equal(resolved, null);
  assert.equal(existsSync(path.join(root, 'cancelled-app')), false);
  assert.deepEqual(await fsp.readdir(root), []);
});

test('an interrupt during staging removes staging and leaves no target', async () => {
  const root = await tempRoot();
  const target = path.join(root, 'interrupted-app');
  const plan = makePlan(root, 'interrupted-app');
  let interruptCleanup: (() => void) | undefined;

  const dependencies: CreateWorkflowDependencies = {
    writeProject: (project, options, context) =>
      writeResolvedProject(project, options, {
        ...(context ?? {}),
        registerInterruptCleanup(cleanup) {
          interruptCleanup = cleanup;
          return () => undefined;
        },
        hooks: {
          beforeWriteFile() {
            assert.ok(interruptCleanup, 'write context registered cleanup');
            interruptCleanup();
            throw CliError.interrupted('simulated SIGINT');
          }
        }
      })
  };

  await assert.rejects(
    runWorkflow(plan, { cwd: root, dependencies }),
    (error: unknown) =>
      error instanceof CliError &&
      error.code === 'INTERRUPTED' &&
      error.exitCode === 130
  );

  assert.equal(existsSync(target), false);
  assert.deepEqual(await fsp.readdir(root), []);
  assert.deepEqual(await temporaryEntries(root), []);
});
