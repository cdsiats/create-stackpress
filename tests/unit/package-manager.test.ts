import assert from 'node:assert/strict';
import test from 'node:test';
import { detectPackageManager } from '../../src/package-manager/detect.js';

test('detects package managers from the user agent', () => {
  assert.equal(detectPackageManager({ userAgent: 'npm/10.9.2 node/v22' }), 'npm');
  assert.equal(detectPackageManager({ userAgent: 'pnpm/9.15.0 npm/? node/v22' }), 'pnpm');
  assert.equal(detectPackageManager({ userAgent: 'yarn/4.5.0 npm/? node/v22' }), 'yarn');
  assert.equal(detectPackageManager({ userAgent: 'bun/1.2.0 npm/? node/v22' }), 'bun');
});

test('falls back to packageManager, lockfiles, then npm', () => {
  assert.equal(
    detectPackageManager({ userAgent: '', packageManager: 'pnpm@9.15.0' }),
    'pnpm'
  );
  assert.equal(
    detectPackageManager({ userAgent: '', lockfiles: ['yarn.lock'] }),
    'yarn'
  );
  assert.equal(
    detectPackageManager({ userAgent: '', lockfiles: ['bun.lockb'] }),
    'bun'
  );
  assert.equal(detectPackageManager({ userAgent: '' }), 'npm');
});
