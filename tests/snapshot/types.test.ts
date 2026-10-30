import assert from 'node:assert/strict';
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { fileURLToPath } from 'node:url';
import { validateFragmentManifest } from '../../src/template/manifest.js';
import { resolveProject } from '../../src/template/resolve.js';
import {
  PROJECT_TYPES,
  type CreatePlan,
  type ProjectType
} from '../../src/types.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');
const TEMPLATES_ROOT = path.join(REPO_ROOT, 'templates');
const FIXTURES_ROOT = path.join(HERE, '..', 'fixtures', 'types');

const BASE_MANIFEST_FILES = [
  '.env.sample',
  'AGENTS.md',
  'README.md',
  'config/build.ts',
  'config/client.ts',
  'config/common.ts',
  'config/develop.ts',
  'gitignore',
  'plugins/app/pages/home.ts',
  'plugins/app/plugin.ts',
  'plugins/app/views/home.tsx',
  'plugins/store/plugin.ts',
  'plugins/store/populate.ts',
  'schema.idea',
  'scripts/stackpress.ts',
  'tsconfig.json',
  'uno.config.ts'
];

const DATABASE_FILES = [
  'plugins/store/connect.ts'
];

const TYPE_FILES: Record<ProjectType, string[]> = {
  'full-stack': [],
  'api-only': [],
  minimal: [],
  'admin-only': []
};

const TYPE_CAPABILITIES: Record<ProjectType, string[]> = {
  'full-stack': ['views', 'admin', 'api', 'auth', 'content', 'database'],
  'api-only': ['api', 'auth', 'database'],
  minimal: ['database'],
  'admin-only': ['admin', 'auth', 'database']
};

const BASE_PLUGINS = [
  'plugins/app/plugin',
  'plugins/store/plugin',
  'stackpress'
];

const TYPE_PLUGINS: Record<ProjectType, string[]> = {
  'full-stack': [],
  'api-only': [],
  minimal: [],
  'admin-only': []
};

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function sorted(values: Iterable<string>): string[] {
  return [...values].sort(compareText);
}

function outputPath(manifestPath: string): string {
  return manifestPath === 'gitignore' ? '.gitignore' : manifestPath;
}

function expectedFiles(type: ProjectType): string[] {
  return sorted([
    ...BASE_MANIFEST_FILES.map(outputPath),
    ...TYPE_FILES[type],
    ...DATABASE_FILES
  ]);
}

function expectedPlugins(type: ProjectType): string[] {
  return sorted(new Set([...BASE_PLUGINS, ...TYPE_PLUGINS[type]]));
}

function createPlan(type: ProjectType): CreatePlan {
  return {
    targetDir: path.join(os.tmpdir(), 'create-stackpress-output', type),
    packageName: `fixture-${type}`,
    type,
    database: 'pglite',
    packageManager: 'npm',
    install: false,
    git: false,
    overwrite: false,
    dryRun: false,
    noAgentsMd: false
  };
}

async function listFragmentFiles(
  root: string,
  relative = ''
): Promise<string[]> {
  const directory = relative ? path.join(root, relative) : root;
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const next = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await listFragmentFiles(root, next)));
    } else if (entry.isFile() && next !== 'manifest.json') {
      files.push(next);
    }
  }

  return sorted(files);
}

async function readManifest(directory: string) {
  const contents = await readFile(path.join(directory, 'manifest.json'), 'utf8');
  return validateFragmentManifest(
    JSON.parse(contents) as unknown,
    path.join(directory, 'manifest.json')
  );
}

let templateRoot = '';

before(async () => {
  templateRoot = await mkdtemp(
    path.join(os.tmpdir(), 'create-stackpress-types-')
  );

  await cp(
    path.join(TEMPLATES_ROOT, 'base'),
    path.join(templateRoot, 'base'),
    { recursive: true }
  );
  await cp(
    path.join(FIXTURES_ROOT, 'database-stub'),
    path.join(templateRoot, 'databases', 'pglite'),
    { recursive: true }
  );

  for (const type of PROJECT_TYPES) {
    await cp(
      path.join(TEMPLATES_ROOT, 'types', type),
      path.join(templateRoot, 'types', type),
      { recursive: true }
    );
  }

  const index = {
    schemaVersion: 1,
    fragments: [
      { id: 'base', kind: 'base', path: 'base' },
      ...PROJECT_TYPES.map((type) => ({
        id: type,
        kind: 'type',
        path: `types/${type}`
      })),
      { id: 'database-pglite', kind: 'database', path: 'databases/pglite' }
    ]
  };
  await writeFile(
    path.join(templateRoot, 'manifest.json'),
    `${JSON.stringify(index, null, 2)}\n`
  );
});

after(async () => {
  if (templateRoot) {
    await rm(templateRoot, { recursive: true, force: true });
  }
});

test('base and type manifests conform to the contract and list exactly their files', async () => {
  const fragments = [
    { directory: 'base', id: 'base', kind: 'base' as const },
    ...PROJECT_TYPES.map((type) => ({
      directory: `types/${type}`,
      id: type,
      kind: 'type' as const
    })),
    {
      directory: '../tests/fixtures/types/database-stub',
      id: 'database-pglite',
      kind: 'database' as const
    }
  ];

  for (const fragment of fragments) {
    const directory = path.join(TEMPLATES_ROOT, fragment.directory);
    const manifest = await readManifest(directory);

    assert.equal(manifest.id, fragment.id);
    assert.equal(manifest.kind, fragment.kind);

    const listed = sorted([
      ...(manifest.files ?? []),
      ...(manifest.assets ?? [])
    ]);
    const actual = await listFragmentFiles(directory);
    assert.deepEqual(
      listed,
      actual,
      `${fragment.directory} manifest files must match the directory`
    );

    if (fragment.kind === 'type') {
      assert.deepEqual(manifest.requires, ['base']);
      assert.deepEqual(
        manifest.capabilities,
        TYPE_CAPABILITIES[fragment.id as ProjectType]
      );
    } else if (fragment.kind === 'base') {
      assert.deepEqual(manifest.requires, []);
      assert.deepEqual(manifest.capabilities, []);
    } else {
      assert.deepEqual(manifest.requires, ['base']);
      assert.deepEqual(manifest.capabilities, ['database']);
    }
  }

  const base = await readManifest(path.join(TEMPLATES_ROOT, 'base'));
  assert.deepEqual(base.package?.scripts, {
    build: 'tsx scripts/stackpress.ts build --b config/build -v',
    dev: 'dotenv -e .env -- tsx scripts/stackpress.ts serve --b config/develop -v',
    generate: 'tsx scripts/stackpress.ts generate --b config/develop -v',
    push: 'dotenv -e .env -- tsx scripts/stackpress.ts push --b config/develop -v'
  });
  assert.deepEqual(base.package?.plugins, BASE_PLUGINS);
});

for (const type of PROJECT_TYPES) {
  test(`resolves the ${type} type with a database stub`, async () => {
    const plan = createPlan(type);
    const project = await resolveProject({ plan, templateRoot });

    assert.equal(project.plan, plan);
    assert.deepEqual(project.capabilities, TYPE_CAPABILITIES[type]);
    assert.deepEqual(project.plugins, expectedPlugins(type));
    assert.deepEqual(project.packageJson.plugins, expectedPlugins(type));

    const paths = project.files.map((file) => file.path);
    assert.deepEqual(paths, expectedFiles(type));
    assert.ok(paths.includes('.gitignore'), 'gitignore must render as .gitignore');
    assert.ok(!paths.includes('gitignore'), 'gitignore must not be rendered as-is');

    for (const file of project.files) {
      if (typeof file.contents !== 'string') continue;
      assert.doesNotMatch(
        file.contents,
        /\{\{[A-Za-z0-9_-]+\}\}/,
        `unresolved token in ${file.path}`
      );
    }

    const readme = project.files.find((file) => file.path === 'README.md');
    assert.ok(readme && typeof readme.contents === 'string');
    assert.match(readme.contents, new RegExp(`# ${plan.packageName}`));
    assert.match(readme.contents, new RegExp(`\`${type}\``));
    assert.match(readme.contents, /`pglite`/);
    assert.match(readme.contents, /@stackpress\/inquire-pglite/);
    assert.match(readme.contents, /@electric-sql\/pglite/);

    const env = new Map(
      project.env.map((line) => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator), line.slice(separator + 1)];
      })
    );
    assert.equal(env.get('DATABASE_URL'), './.build/database');
    assert.ok(env.has('SESSION_SEED'));

    assert.deepEqual(project.warnings, []);

    const scripts = project.packageJson.scripts as Record<string, string>;
    assert.deepEqual(Object.keys(scripts), ['build', 'dev', 'generate', 'push']);

    const dependencies = project.packageJson.dependencies as Record<
      string,
      string
    >;
    assert.equal(dependencies.stackpress, '0.10.8');
    assert.equal(dependencies.react, '19.2.4');
    assert.equal(dependencies['react-dom'], '19.2.4');
    assert.equal(dependencies['@stackpress/ingest'], '0.10.8');
    assert.equal(dependencies['stackpress-server'], '0.10.8');
  });
}
