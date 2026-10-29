import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CliError,
  errorMessage,
  exitCodeForError
} from '../../src/errors.js';

test('CliError maps categories to exit codes', () => {
  assert.equal(CliError.usage('bad flag').exitCode, 2);
  assert.equal(CliError.preflight('bad target').exitCode, 2);
  assert.equal(CliError.generation('write failed').exitCode, 1);
  assert.equal(CliError.install('install failed').exitCode, 1);
  assert.equal(CliError.interrupted().exitCode, 130);
});

test('exitCodeForError handles known and unknown errors', () => {
  assert.equal(exitCodeForError(CliError.usage('bad')), 2);
  assert.equal(exitCodeForError(new Error('boom')), 1);
  assert.equal(exitCodeForError('boom'), 1);
});

test('errorMessage preserves messages', () => {
  assert.equal(errorMessage(CliError.usage('bad flag')), 'bad flag');
  assert.equal(errorMessage(new Error('boom')), 'boom');
  assert.equal(errorMessage('boom'), 'boom');
});
