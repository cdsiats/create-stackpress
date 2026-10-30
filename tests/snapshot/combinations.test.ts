import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  DATABASES,
  PROJECT_TYPES,
  type CreatePlan,
  type DatabaseId,
  type ProjectType
} from '../../src/types.js';
import type { ResolvedProject } from '../../src/template/types.js';
import { resolveProject } from '../../src/template/resolve.js';

const fixtureRoot = fileURLToPath(
  new URL('../fixtures/fragments', import.meta.url)
);
const snapshotPath = fileURLToPath(
  new URL('../fixtures/fragments/snapshots.json', import.meta.url)
);

type SnapshotFile = {
  path: string;
  binary: boolean;
  fragmentId: string;
  contents?: string;
  bytes?: number;
  sha256?: string;
};

type CombinationSnapshot = {
  type: ProjectType;
  database: DatabaseId;
  capabilities: string[];
  env: string[];
  plugins: string[];
  packageJson: Record<string, unknown>;
  warnings: string[];
  files: SnapshotFile[];
};

function createPlan(type: ProjectType, database: DatabaseId): CreatePlan {
  return {
    targetDir: `C:/tmp/${type}-${database}`,
    packageName: 'stackpress-app',
    type,
    database,
    packageManager: 'npm',
    install: false,
    git: false,
    overwrite: false,
    dryRun: false,
    noAgentsMd: false
  };
}

function buildSnapshot(project: ResolvedProject): CombinationSnapshot {
  return {
    type: project.plan.type,
    database: project.plan.database,
    capabilities: [...project.capabilities],
    env: [...project.env],
    plugins: [...project.plugins],
    packageJson: project.packageJson,
    warnings: [...project.warnings],
    files: project.files.map((file) => {
      if (file.binary) {
        const contents = file.contents as Uint8Array;
        return {
          path: file.path,
          binary: true,
          fragmentId: file.fragmentId,
          bytes: contents.byteLength,
          sha256: createHash('sha256').update(contents).digest('hex')
        };
      }
      return {
        path: file.path,
        binary: false,
        fragmentId: file.fragmentId,
        contents: file.contents as string
      };
    })
  };
}

test('snapshots all twenty project type and database combinations', async () => {
  const snapshots = JSON.parse(
    await readFile(snapshotPath, 'utf8')
  ) as Record<string, CombinationSnapshot>;

  let count = 0;
  for (const type of PROJECT_TYPES) {
    for (const database of DATABASES) {
      const key = `${type}:${database}`;
      const expected = snapshots[key];
      assert.ok(expected, `missing snapshot for ${key}`);

      const project = await resolveProject({
        plan: createPlan(type, database),
        templateRoot: fixtureRoot
      });
      assert.deepEqual(buildSnapshot(project), expected);
      assert.equal(project.files.length, expected.files.length);

      const repeated = await resolveProject({
        plan: createPlan(type, database),
        templateRoot: fixtureRoot
      });
      assert.deepEqual(buildSnapshot(repeated), expected);
      count += 1;
    }
  }

  assert.equal(count, 20);
  assert.deepEqual(Object.keys(snapshots).sort(), [
    'admin-only:cockroachdb',
    'admin-only:mysql',
    'admin-only:pglite',
    'admin-only:postgres',
    'admin-only:sqlite',
    'api-only:cockroachdb',
    'api-only:mysql',
    'api-only:pglite',
    'api-only:postgres',
    'api-only:sqlite',
    'full-stack:cockroachdb',
    'full-stack:mysql',
    'full-stack:pglite',
    'full-stack:postgres',
    'full-stack:sqlite',
    'minimal:cockroachdb',
    'minimal:mysql',
    'minimal:pglite',
    'minimal:postgres',
    'minimal:sqlite'
  ]);
});

test('keeps snapshot keys and arrays stable across runs', async () => {
  const first = await resolveProject({
    plan: createPlan('admin-only', 'cockroachdb'),
    templateRoot: fixtureRoot
  });
  const second = await resolveProject({
    plan: createPlan('admin-only', 'cockroachdb'),
    templateRoot: fixtureRoot
  });

  assert.equal(
    JSON.stringify(buildSnapshot(first)),
    JSON.stringify(buildSnapshot(second))
  );
  assert.deepEqual(
    first.files.map((file) => file.path),
    [...first.files.map((file) => file.path)].sort()
  );
  assert.deepEqual(first.plugins, [...first.plugins].sort());
  assert.deepEqual(first.env, [...first.env].sort());
  assert.deepEqual(
    Object.keys(first.packageJson.dependencies as Record<string, string>),
    Object.keys(first.packageJson.dependencies as Record<string, string>).sort()
  );
  assert.deepEqual(
    Object.keys(first.packageJson.devDependencies as Record<string, string>),
    Object.keys(first.packageJson.devDependencies as Record<string, string>).sort()
  );
  assert.deepEqual(
    Object.keys(first.packageJson.scripts as Record<string, string>),
    Object.keys(first.packageJson.scripts as Record<string, string>).sort()
  );
});
