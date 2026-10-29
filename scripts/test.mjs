import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

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

if (existsSync('tests')) {
  walk('tests');
}

if (files.length === 0) {
  console.error('No test files found under tests/');
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  ['--import', 'tsx', '--test', ...files],
  { stdio: 'inherit' }
);

process.exit(result.status ?? 1);
