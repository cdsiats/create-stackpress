import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NEXT_STEP_SCRIPTS,
  assertSafeArguments,
  formatPackageManagerCommand,
  getInstallCommand,
  getNextStepCommands,
  getRunScriptCommand,
  resolvePackageManagerExecutable,
  usesShellForPackageManager
} from '../../src/package-manager/commands.js';
import { PACKAGE_MANAGERS, type PackageManager } from '../../src/types.js';

const WINDOWS_EXECUTABLES: Record<PackageManager, string> = {
  npm: 'npm.cmd',
  pnpm: 'pnpm.cmd',
  yarn: 'yarn.cmd',
  bun: 'bun.exe'
};

test('maps the fixed install command for every package manager', () => {
  for (const manager of PACKAGE_MANAGERS) {
    const posix = getInstallCommand(manager, { platform: 'linux' });
    assert.equal(posix.manager, manager);
    assert.equal(posix.executable, manager);
    assert.deepEqual(posix.args, ['install']);
    assert.equal(posix.display, `${manager} install`);

    const windows = getInstallCommand(manager, { platform: 'win32' });
    assert.equal(windows.executable, WINDOWS_EXECUTABLES[manager]);
    assert.deepEqual(windows.args, ['install']);
    assert.equal(formatPackageManagerCommand(windows), `${manager} install`);
  }
});

test('maps run-script commands and exact next-step commands', () => {
  for (const manager of PACKAGE_MANAGERS) {
    for (const script of NEXT_STEP_SCRIPTS) {
      const command = getRunScriptCommand(manager, script, { platform: 'linux' });
      assert.deepEqual(command.args, ['run', script]);
      assert.equal(command.display, `${manager} run ${script}`);
    }

    assert.deepEqual(getNextStepCommands(manager), [
      `${manager} install`,
      `${manager} run generate`,
      `${manager} run push`,
      `${manager} run dev`
    ]);
  }
});

test('next-step scripts follow the contract order', () => {
  assert.deepEqual([...NEXT_STEP_SCRIPTS], ['generate', 'push', 'dev']);
  assert.deepEqual(getNextStepCommands('pnpm'), [
    'pnpm install',
    'pnpm run generate',
    'pnpm run push',
    'pnpm run dev'
  ]);
});

test('rejects shell metacharacters in dynamic arguments', () => {
  const unsafeScripts = [
    'dev && echo pwned',
    'dev; echo pwned',
    'dev|cat',
    'dev > out.txt',
    '$(whoami)',
    '`id`',
    'dev\nrm -rf /',
    'dev\tpush',
    'dev"quote',
    "dev'quote",
    'dev\\path',
    'dev*',
    'dev name',
    '',
    '-evil'
  ];

  for (const script of unsafeScripts) {
    assert.throws(
      () => getRunScriptCommand('npm', script),
      /Unsafe package-manager script name/,
      `expected script ${JSON.stringify(script)} to be rejected`
    );
  }

  for (const argument of [
    'a & b',
    'a | b',
    'a;b',
    'a>b',
    'a<b',
    'a^b',
    'a%b',
    'a!b',
    'a(b)',
    'a[b]',
    'a{b}',
    'a"b',
    "a'b",
    'a`b',
    'a\\b',
    'a*b',
    'a?b',
    'a#b',
    'a~b',
    '$(id)',
    '`id`',
    'a\nb',
    'a\tb',
    ''
  ]) {
    assert.throws(
      () => assertSafeArguments([argument]),
      /Unsafe package-manager argument/,
      `expected argument ${JSON.stringify(argument)} to be rejected`
    );
  }
});

test('accepts fixed and package-shaped arguments', () => {
  assert.doesNotThrow(() =>
    assertSafeArguments([
      'install',
      '--no-audit',
      '--ignore-scripts',
      '@scope/pkg',
      'pkg@1.2.3',
      '--install-strategy=hoisted',
      'db:push',
      'dev'
    ])
  );
  assert.deepEqual(getRunScriptCommand('yarn', 'db:push').args, [
    'run',
    'db:push'
  ]);
});

test('keeps argument ordering stable and returns defensive copies', () => {
  const first = getInstallCommand('bun');
  const second = getInstallCommand('bun');
  assert.deepEqual(first.args, ['install']);
  assert.deepEqual(second.args, ['install']);

  first.args.push('mutated');
  assert.deepEqual(second.args, ['install']);
  assert.deepEqual(getInstallCommand('bun').args, ['install']);

  const script = getRunScriptCommand('pnpm', 'dev');
  assert.deepEqual(script.args, ['run', 'dev']);
  script.args.reverse();
  assert.deepEqual(getRunScriptCommand('pnpm', 'dev').args, ['run', 'dev']);
});

test('appends only allowlisted extra install flags', () => {
  const command = getInstallCommand('npm', {
    platform: 'linux',
    extraArgs: ['--ignore-scripts', '--no-audit', '--no-fund']
  });
  assert.deepEqual(command.args, [
    'install',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund'
  ]);
  assert.equal(
    command.display,
    'npm install --ignore-scripts --no-audit --no-fund'
  );

  assert.throws(
    () => getInstallCommand('npm', { extraArgs: ['--prefix=/tmp && rm'] }),
    /Unsafe package-manager argument/
  );
});

test('uses a shell only on Windows', () => {
  assert.equal(usesShellForPackageManager('win32'), true);
  assert.equal(usesShellForPackageManager('linux'), false);
  assert.equal(usesShellForPackageManager('darwin'), false);
  assert.equal(resolvePackageManagerExecutable('bun', 'win32'), 'bun.exe');
  assert.equal(resolvePackageManagerExecutable('bun', 'darwin'), 'bun');
});

test('rejects unknown managers at runtime', () => {
  assert.throws(
    () => getInstallCommand('cargo' as PackageManager),
    /Unsupported package manager: cargo/
  );
});
