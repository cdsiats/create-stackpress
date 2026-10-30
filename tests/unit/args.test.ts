import assert from 'node:assert/strict';
import test from 'node:test';
import {
  helpText,
  normalizeDatabase,
  normalizePackageManager,
  normalizeProjectType,
  parseCliArgs,
  versionText
} from '../../src/args.js';
import { CliError } from '../../src/errors.js';

test('parses a directory and full flag set', () => {
  const options = parseCliArgs([
    'my-app',
    '--type', 'api',
    '--db', 'crdb',
    '--pm', 'PNPM',
    '--install',
    '--git',
    '--template', 'owner/repo#main',
    '--db-url', 'postgres://example',
    '--overwrite',
    '--dry-run',
    '--yes',
    '--no-input',
    '--no-color',
    '--no-agents-md'
  ]);

  assert.equal(options.directory, 'my-app');
  assert.equal(options.type, 'api-only');
  assert.equal(options.database, 'cockroachdb');
  assert.equal(options.packageManager, 'pnpm');
  assert.equal(options.install, true);
  assert.equal(options.git, true);
  assert.equal(options.template, 'owner/repo#main');
  assert.equal(options.databaseUrl, 'postgres://example');
  assert.equal(options.overwrite, true);
  assert.equal(options.dryRun, true);
  assert.equal(options.yes, true);
  assert.equal(options.noInput, true);
  assert.equal(options.noColor, true);
  assert.equal(options.noAgentsMd, true);
});

test('normalizes aliases', () => {
  assert.equal(normalizeProjectType('fullstack'), 'full-stack');
  assert.equal(normalizeProjectType('blank'), 'minimal');
  assert.equal(normalizeProjectType('admin'), 'admin-only');
  assert.equal(normalizeDatabase('pg'), 'postgres');
  assert.equal(normalizeDatabase('postgresql'), 'postgres');
  assert.equal(normalizeDatabase('cockroach'), 'cockroachdb');
  assert.equal(normalizePackageManager('YARN'), 'yarn');
});

test('rejects invalid values and conflicting flags', () => {
  assert.throws(() => normalizeProjectType('desktop'), CliError);
  assert.throws(() => normalizeDatabase('oracle'), CliError);
  assert.throws(() => normalizePackageManager('deno'), CliError);
  assert.throws(
    () => parseCliArgs(['my-app', '--install', '--no-install']),
    CliError
  );
  assert.throws(
    () => parseCliArgs(['my-app', '--git', '--no-git']),
    CliError
  );
});

test('rejects multiple directories and unknown flags', () => {
  assert.throws(() => parseCliArgs(['one', 'two']), CliError);
  assert.throws(() => parseCliArgs(['--wat']), CliError);
});

test('help and version short flags are supported', () => {
  assert.equal(parseCliArgs(['-h']).help, true);
  assert.equal(parseCliArgs(['-v']).version, true);
});

test('help and version text include the contract surface', () => {
  const help = helpText();
  assert.match(help, /Usage:/);
  assert.match(help, /--type <type>/);
  assert.match(help, /--dry-run/);

  const version = versionText();
  assert.match(version, /create-stackpress \d+\.\d+\.\d+/);
  assert.match(version, /template \d+\.\d+\.\d+/);
  assert.match(version, /stackpress 0\.10\.8/);
});
