import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CLI_VERSION,
  PACKAGE_NAME,
  STACKPRESS_VERSION,
  TEMPLATE_VERSION
} from '../src/version.js';

test('package identity and versions are set', () => {
  assert.equal(PACKAGE_NAME, '@cdsiats/create-stackpress');
  assert.match(CLI_VERSION, /^\d+\.\d+\.\d+$/);
  assert.match(TEMPLATE_VERSION, /^\d+\.\d+\.\d+$/);
  assert.match(STACKPRESS_VERSION, /^\d+\.\d+\.\d+$/);
});
