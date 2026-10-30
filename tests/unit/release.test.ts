import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..'
);
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'release-check.mjs');
const PACKAGE_VERSION = (
  JSON.parse(
    readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')
  ) as { version: string }
).version;

function runReleaseCheck(args: string[]) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8'
  });
}

test('release metadata is consistent', () => {
  const result = runReleaseCheck([]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /release check passed: @cdsiats\/create-stackpress@/);
});

test('release check accepts the matching tag', () => {
  const result = runReleaseCheck(['--tag', `v${PACKAGE_VERSION}`]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(`for tag v${PACKAGE_VERSION}`));
});

test('release check rejects a tag that does not match package.json', () => {
  const result = runReleaseCheck(['--tag', 'v999.0.0']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /does not match package\.json version/);
});

test('release check rejects unknown arguments', () => {
  const result = runReleaseCheck(['--unknown']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unknown argument: --unknown/);
});
