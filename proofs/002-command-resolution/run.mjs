import assert from 'node:assert/strict';
import {
  PACKAGE_MANAGERS,
  assertSafeArgs,
  detectPackageManager,
  formatCommand,
  getCommand,
  resolveExecutable,
  runCommand,
  runPackageManager,
  runVersion
} from './commands.mjs';

console.log('Detection');
assert.equal(detectPackageManager({ userAgent: 'npm/10.9.2 node/v22.15.1 win32 x64' }), 'npm');
assert.equal(detectPackageManager({ userAgent: 'pnpm/9.15.0 npm/? node/v22.15.1 win32 x64' }), 'pnpm');
assert.equal(detectPackageManager({ userAgent: 'yarn/4.5.0 npm/? node/v22.15.1 win32 x64' }), 'yarn');
assert.equal(detectPackageManager({ userAgent: 'bun/1.2.0 npm/? node/v22.15.1 win32 x64' }), 'bun');
assert.equal(detectPackageManager({ userAgent: '', packageJson: { packageManager: 'pnpm@9.15.0' }, files: [] }), 'pnpm');
assert.equal(detectPackageManager({ userAgent: '', files: ['yarn.lock'] }), 'yarn');
assert.equal(detectPackageManager({ userAgent: '', files: ['bun.lock'] }), 'bun');
assert.equal(detectPackageManager({ userAgent: '', files: [] }), 'npm');
console.log('PASS: user-agent, packageManager field, lockfile, and fallback detection');

console.log('');
console.log('Executable resolution');
assert.equal(resolveExecutable('npm', 'win32'), 'npm.cmd');
assert.equal(resolveExecutable('pnpm', 'win32'), 'pnpm.cmd');
assert.equal(resolveExecutable('yarn', 'win32'), 'yarn.cmd');
assert.equal(resolveExecutable('bun', 'win32'), 'bun.exe');
assert.equal(resolveExecutable('npm', 'darwin'), 'npm');
assert.equal(resolveExecutable('pnpm', 'linux'), 'pnpm');
console.log('PASS: Windows shims and POSIX executable names');

console.log('');
console.log('Command mapping');
assert.deepEqual(getCommand('npm', 'install'), { command: 'npm', args: ['install'] });
assert.deepEqual(getCommand('npm', 'run', ['dev']), { command: 'npm', args: ['run', 'dev'] });
assert.equal(formatCommand('npm', 'run', ['dev']), 'npm run dev');
assert.equal(formatCommand('pnpm', 'run', ['dev']), 'pnpm run dev');
assert.equal(formatCommand('yarn', 'run', ['dev']), 'yarn run dev');
assert.equal(formatCommand('bun', 'run', ['dev']), 'bun run dev');
assert.deepEqual(getCommand('pnpm', 'exec', ['stackpress', 'push']), {
  command: 'pnpm',
  args: ['exec', 'stackpress', 'push']
});
assert.deepEqual(getCommand('yarn', 'exec', ['stackpress', 'push']), {
  command: 'yarn',
  args: ['yarn', 'stackpress', 'push']
});
assert.deepEqual(getCommand('bun', 'exec', ['stackpress', 'push']), {
  command: 'bun',
  args: ['bunx', 'stackpress', 'push']
});
assert.throws(() => getCommand('npm', 'unknown'), /Unsupported command/);
assert.throws(() => resolveExecutable('unknown'), /Unsupported package manager/);
assert.throws(() => assertSafeArgs(['a & b']), /Unsafe package-manager argument/);
assert.throws(() => assertSafeArgs(['a | b']), /Unsafe package-manager argument/);
assert.doesNotThrow(() => assertSafeArgs(['install', '--no-audit', '@scope/pkg']));
console.log('PASS: install, run, exec, and invalid command handling');
console.log('PASS: shell metacharacters rejected in package-manager arguments');

console.log('');
console.log('Actual execution from a path with spaces');
console.log(`cwd: ${process.cwd()}`);

const rawCmd = await runCommand(resolveExecutable('npm'), ['--version'], {
  cwd: process.cwd(),
  shell: false
});
if (process.platform === 'win32') {
  console.log(`Observed .cmd with shell:false: ${rawCmd.ok ? 'unexpected success' : rawCmd.error || rawCmd.code}`);
  assert.equal(rawCmd.ok, false, 'Windows .cmd launch without shell must fail');
  console.log('PASS: failure reproduced; fallback is required on Windows');
} else {
  console.log(`POSIX direct execution: ${rawCmd.ok ? 'ok' : rawCmd.error || rawCmd.code}`);
}

const npmVersion = await runVersion('npm', { cwd: process.cwd() });
assert.equal(npmVersion.ok, true, `npm --version failed: ${npmVersion.stderr}`);
assert.match(npmVersion.stdout.trim(), /^\d+\./, 'npm version output should start with a number');
console.log(`PASS: npm --version via resolved command -> ${npmVersion.stdout.trim()}`);

for (const manager of PACKAGE_MANAGERS.filter((manager) => manager !== 'npm')) {
  const result = await runVersion(manager, { cwd: process.cwd() });
  if (result.ok) {
    console.log(`PASS: ${manager} --version -> ${result.stdout.trim()}`);
  } else {
    console.log(`SKIP: ${manager} is not installed or not executable (${result.error || result.code})`);
  }
}

console.log('');
console.log('Argument preservation without a shell');
const script = 'console.log(JSON.stringify(process.argv.slice(1)))';
const literalArgs = ['a & b', 'c d', '--not-a-flag'];
const literal = await runCommand(process.execPath, ['-e', script, ...literalArgs], {
  cwd: process.cwd()
});
assert.equal(literal.ok, true, literal.stderr);
assert.deepEqual(JSON.parse(literal.stdout), literalArgs);
console.log('PASS: spaces and shell metacharacters stay literal arguments');

console.log('');
console.log('Runtime detection');
console.log(`npm_config_user_agent: ${process.env.npm_config_user_agent || '(not set)'}`);
console.log(`detected: ${detectPackageManager()}`);
console.log('');
console.log('PASS: command resolution and execution proof complete');
