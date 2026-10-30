import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { DATABASES, type CreatePlan, type DatabaseId } from '../../src/types.js';
import {
  DATABASE_METADATA,
  loadFragmentManifest
} from '../../src/template/manifest.js';
import { resolveProject } from '../../src/template/resolve.js';
import type { ResolvedFile } from '../../src/template/types.js';

type DatabaseExpectation = {
  adapter: string;
  driver: string;
  adapterVersion: string;
  driverVersion: string;
  connection: string;
  defaultUrl: string;
  envLine: string;
  devDependencies: Record<string, string>;
};

const EXPECTATIONS = {
  pglite: {
    adapter: '@stackpress/inquire-pglite',
    driver: '@electric-sql/pglite',
    adapterVersion: '0.10.8',
    driverVersion: '0.3.15',
    connection: 'stackpress/pglite',
    defaultUrl: './.build/database',
    envLine: 'DATABASE_URL=./.build/database',
    devDependencies: {}
  },
  postgres: {
    adapter: '@stackpress/inquire-pg',
    driver: 'pg',
    adapterVersion: '0.10.8',
    driverVersion: '8.16.3',
    connection: 'stackpress/pgsql',
    defaultUrl: 'postgres://postgres:postgres@localhost:5432/app',
    envLine: 'DATABASE_URL=postgres://postgres:postgres@localhost:5432/app',
    devDependencies: { '@types/pg': '8.16.0' }
  },
  cockroachdb: {
    adapter: '@stackpress/inquire-pg',
    driver: 'pg',
    adapterVersion: '0.10.8',
    driverVersion: '8.16.3',
    connection: 'stackpress/pgsql',
    defaultUrl: 'postgres://root@localhost:26257/defaultdb?sslmode=disable',
    envLine:
      'DATABASE_URL=postgres://root@localhost:26257/defaultdb?sslmode=disable',
    devDependencies: { '@types/pg': '8.16.0' }
  },
  mysql: {
    adapter: '@stackpress/inquire-mysql2',
    driver: 'mysql2',
    adapterVersion: '0.10.8',
    driverVersion: '3.15.3',
    connection: 'stackpress/mysql',
    defaultUrl: 'mysql://root:root@localhost:3306/app',
    envLine: 'DATABASE_URL=mysql://root:root@localhost:3306/app',
    devDependencies: {}
  },
  sqlite: {
    adapter: '@stackpress/inquire-sqlite3',
    driver: 'better-sqlite3',
    adapterVersion: '0.10.8',
    driverVersion: '12.4.1',
    connection: 'stackpress/sqlite',
    defaultUrl: './.build/database.sqlite',
    envLine: 'DATABASE_URL=./.build/database.sqlite',
    devDependencies: { '@types/better-sqlite3': '7.6.13' }
  }
} satisfies Record<DatabaseId, DatabaseExpectation>;

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDirectory, '..', '..');
const fixtureRoot = path.resolve(testDirectory, '..', 'fixtures', 'databases');
const databaseRoot = path.join(repoRoot, 'templates', 'databases');

function planFor(database: DatabaseId): CreatePlan {
  return {
    targetDir: path.join(tmpdir(), `create-stackpress-${database}`),
    packageName: `database-${database}-snapshot`,
    type: 'minimal',
    database,
    packageManager: 'npm',
    install: false,
    git: false,
    overwrite: false,
    dryRun: false,
    noAgentsMd: false
  };
}

function copyFixture(source: string, destination: string): void {
  cpSync(source, destination, { recursive: true });
}

function createTemplateRoot(database: DatabaseId): string {
  const root = mkdtempSync(
    path.join(tmpdir(), `create-stackpress-database-${database}-`)
  );

  copyFixture(path.join(fixtureRoot, 'base-stub'), path.join(root, 'base'));
  copyFixture(
    path.join(fixtureRoot, 'type-stub'),
    path.join(root, 'types', 'minimal')
  );
  copyFixture(
    path.join(databaseRoot, database),
    path.join(root, 'databases', database)
  );

  writeFileSync(
    path.join(root, 'manifest.json'),
    `${JSON.stringify({
      schemaVersion: 1,
      fragments: [
        { id: 'base', kind: 'base', path: 'base' },
        { id: 'minimal', kind: 'type', path: 'types/minimal' },
        {
          id: `database-${database}`,
          kind: 'database',
          path: `databases/${database}`
        }
      ]
    }, null, 2)}\n`
  );

  return root;
}

function fileText(
  files: Map<string, ResolvedFile>,
  filePath: string
): string {
  const file = files.get(filePath);
  assert.ok(file, `expected resolved file ${filePath}`);
  assert.equal(typeof file.contents, 'string', `${filePath} should be text`);
  return file.contents as string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function listFragmentFiles(directory: string): string[] {
  const files: string[] = [];

  const walk = (current: string, relative: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const nextRelative = relative ? `${relative}/${entry.name}` : entry.name;
      const next = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(next, nextRelative);
      } else if (entry.isFile() && entry.name !== 'manifest.json') {
        files.push(nextRelative);
      }
    }
  };

  walk(directory, '');
  return files.sort();
}

test('database fragment manifests match their declared files and pins', async () => {
  for (const database of DATABASES) {
    const expectation = EXPECTATIONS[database];
    const directory = path.join(databaseRoot, database);
    const manifest = await loadFragmentManifest(directory);

    assert.deepEqual(DATABASE_METADATA[database], {
      adapter: expectation.adapter,
      driver: expectation.driver,
      adapterVersion: expectation.adapterVersion,
      driverVersion: expectation.driverVersion,
      connection: expectation.connection
    });
    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.id, `database-${database}`);
    assert.equal(manifest.kind, 'database');
    assert.deepEqual(manifest.requires, ['base']);
    assert.deepEqual(manifest.capabilities, ['database']);
    assert.deepEqual(manifest.files, [
      'plugins/store/connect.ts'
    ]);
    assert.deepEqual(listFragmentFiles(directory), [...manifest.files].sort());
    assert.deepEqual(manifest.env, [expectation.envLine]);
    assert.equal(
      manifest.package?.dependencies?.[expectation.adapter],
      expectation.adapterVersion
    );
    assert.equal(
      manifest.package?.dependencies?.[expectation.driver],
      expectation.driverVersion
    );
    assert.deepEqual(
      manifest.package?.devDependencies ?? {},
      expectation.devDependencies
    );
    assert.deepEqual(manifest.package?.plugins, ['plugins/store/plugin']);
  }
});

for (const database of DATABASES) {
  test(`resolves the ${database} database fragment`, async () => {
    const expectation = EXPECTATIONS[database];
    const templateRoot = createTemplateRoot(database);

    try {
      const resolved = await resolveProject({
        plan: planFor(database),
        templateRoot
      });
      const files = new Map(
        resolved.files.map((file) => [file.path, file])
      );

      assert.deepEqual(
        [...files.keys()].sort(),
        [
          '.env.sample',
          'plugins/store/connect.ts',
          'plugins/store/plugin.ts'
        ]
      );

      const connect = fileText(files, 'plugins/store/connect.ts');
      const envSample = fileText(files, '.env.sample');
      assert.ok(envSample.includes('SESSION_SEED=replace-me'));
      assert.ok(envSample.includes(expectation.envLine));
      assert.equal(
        envSample.split('\n').filter((line) => line === expectation.envLine)
          .length,
        1
      );

      assert.match(
        connect,
        new RegExp(`from '${escapeRegExp(expectation.connection)}';`)
      );
      assert.match(connect, /export default async function connect\(\)/);
      assert.match(connect, /process\.env\.DATABASE_URL/);
      assert.ok(connect.includes(expectation.defaultUrl));
      assert.doesNotMatch(connect, /console\./);
      assert.doesNotMatch(connect, /\{\{/);

      assert.deepEqual([...resolved.capabilities].sort(), ['database']);
      assert.deepEqual(resolved.plugins, ['plugins/store/plugin']);
      assert.deepEqual(resolved.packageJson.plugins, ['plugins/store/plugin']);

      const dependencies = resolved.packageJson.dependencies as Record<
        string,
        string
      >;
      assert.equal(dependencies.stackpress, '0.10.8');
      assert.equal(
        dependencies[expectation.adapter],
        expectation.adapterVersion
      );
      assert.equal(
        dependencies[expectation.driver],
        expectation.driverVersion
      );
      assert.deepEqual(
        (resolved.packageJson.devDependencies ?? {}) as Record<string, string>,
        expectation.devDependencies
      );

      assert.ok(resolved.env.includes('SESSION_SEED=replace-me'));
      assert.ok(resolved.env.includes(expectation.envLine));
      assert.equal(
        resolved.env.filter((line) => line.startsWith('DATABASE_URL=')).length,
        1
      );
      assert.doesNotMatch(JSON.stringify(resolved.env), /\{\{/);
    } finally {
      rmSync(templateRoot, { recursive: true, force: true });
    }
  });
}

test('generated PGlite connection matches proof 003', async () => {
  const templateRoot = createTemplateRoot('pglite');

  try {
    const resolved = await resolveProject({
      plan: planFor('pglite'),
      templateRoot
    });
    const files = new Map(resolved.files.map((file) => [file.path, file]));
    const generated = fileText(files, 'plugins/store/connect.ts');
    const proof = readFileSync(
      path.join(
        repoRoot,
        'proofs',
        '003-minimal-stackpress-pglite',
        'store',
        'connect.ts'
      ),
      'utf8'
    );

    const statements = [
      "import { PGlite } from '@electric-sql/pglite';",
      "import { connect as pglite } from 'stackpress/pglite';",
      'const file = path.resolve(',
      'process.cwd(),',
      "process.env.DATABASE_URL || './.build/database'",
      'fs.mkdirSync(path.dirname(file), { recursive: true });',
      'return new PGlite(file);'
    ];

    for (const statement of statements) {
      assert.ok(
        proof.includes(statement),
        `proof 003 should contain: ${statement}`
      );
      assert.ok(
        generated.includes(statement),
        `generated PGlite connection should contain: ${statement}`
      );
    }
  } finally {
    rmSync(templateRoot, { recursive: true, force: true });
  }
});
