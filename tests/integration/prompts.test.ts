import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCreateOptions } from '../../src/create/interaction.js';
import { CliError } from '../../src/errors.js';

const nonTty = {
  env: {},
  streams: {
    stdin: { isTTY: false },
    stdout: { isTTY: false }
  },
  detectPackageManager: () => 'npm' as const
};

test('non-TTY without a directory fails without prompting', async () => {
  await assert.rejects(
    () => resolveCreateOptions({}, nonTty),
    (error: unknown) => error instanceof CliError && error.exitCode === 2
  );
});

test('non-TTY with a directory resolves scaffold-only defaults', async () => {
  const resolved = await resolveCreateOptions({ directory: 'my-app' }, nonTty);
  assert.ok(resolved);
  assert.equal(resolved.install, false);
  assert.equal(resolved.git, false);
  assert.equal(resolved.type, 'full-stack');
  assert.equal(resolved.database, 'pglite');
});

test('CI environment is non-interactive even with a TTY', async () => {
  const resolved = await resolveCreateOptions({ directory: 'my-app' }, {
    ...nonTty,
    env: { CI: '1' },
    streams: {
      stdin: { isTTY: true },
      stdout: { isTTY: true }
    }
  });

  assert.ok(resolved);
  assert.equal(resolved.install, false);
});

test('yes mode works without a TTY', async () => {
  const resolved = await resolveCreateOptions({ directory: 'my-app', yes: true }, nonTty);
  assert.ok(resolved);
  assert.equal(resolved.install, true);
  assert.equal(resolved.git, true);
});
