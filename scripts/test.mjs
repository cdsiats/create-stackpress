import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SUITES = ['unit', 'snapshot', 'integration', 'smoke'];
const requested = process.argv.slice(2);

if (requested.includes('--help') || requested.includes('-h')) {
  console.log('Usage: node scripts/test.mjs [suite ...]');
  console.log(`Suites: ${SUITES.join(', ')}`);
  console.log('With no arguments, runs every tests/**/*.test.ts file.');
  process.exit(0);
}

const unknown = requested.filter((suite) => !SUITES.includes(suite));
if (unknown.length > 0) {
  console.error(`Unknown test suite: ${unknown.join(', ')}`);
  console.error(`Available suites: ${SUITES.join(', ')}`);
  process.exit(1);
}

const selected = requested.length > 0 ? [...new Set(requested)] : undefined;
const files = [];

function walk(directory) {
  for (const entry of readdirSync(directory)) {
    const fullPath = path.join(directory, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      walk(fullPath);
    } else if (entry.endsWith('.test.ts')) {
      files.push(fullPath);
    }
  }
}

if (selected) {
  for (const suite of selected) {
    const directory = path.join('tests', suite);
    if (existsSync(directory)) {
      walk(directory);
    }
  }
} else if (existsSync('tests')) {
  walk('tests');
}

if (files.length === 0) {
  const scope = selected ? `suite(s): ${selected.join(', ')}` : 'tests/';
  console.error(`No test files found for ${scope}`);
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  ['--import', 'tsx', '--test', ...files],
  { stdio: 'inherit' }
);

process.exit(result.status ?? 1);
