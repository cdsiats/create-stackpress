import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createOutput,
  paint,
  shouldUseColor
} from '../../src/output.js';

function fakeStream(isTTY = false) {
  const chunks: string[] = [];
  return {
    isTTY,
    chunks,
    write(chunk: string) {
      chunks.push(chunk);
      return true;
    }
  };
}

test('color is enabled only for a TTY without opt-out', () => {
  assert.equal(shouldUseColor({ stream: fakeStream(true), env: {} }), true);
  assert.equal(shouldUseColor({ stream: fakeStream(false), env: {} }), false);
  assert.equal(
    shouldUseColor({ stream: fakeStream(true), env: { NO_COLOR: '1' } }),
    false
  );
  assert.equal(
    shouldUseColor({ stream: fakeStream(true), noColor: true, env: {} }),
    false
  );
});

test('paint emits ANSI only when enabled', () => {
  assert.equal(paint('ok', 'green', false), 'ok');
  assert.match(paint('ok', 'green', true), /\u001b\[32m/);
});

test('output writes errors to stderr and respects no-color', () => {
  const stdout = fakeStream(true);
  const stderr = fakeStream(true);
  const output = createOutput({
    stdout,
    stderr,
    noColor: true,
    env: {}
  });

  output.success('done');
  output.error('failed');

  assert.equal(stdout.chunks.join(''), '✓ done\n');
  assert.equal(stderr.chunks.join(''), '✗ failed\n');
});
