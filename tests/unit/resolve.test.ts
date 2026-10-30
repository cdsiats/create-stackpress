import assert from 'node:assert/strict';
import {
  appendFile,
  cp,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { type TestContext } from 'node:test';
import { CliError } from '../../src/errors.js';
import {
  DATABASES,
  PROJECT_TYPES,
  type CreatePlan,
  type DatabaseId,
  type ProjectType
} from '../../src/types.js';
import { defaultTemplateRoot, resolveProject } from '../../src/template/resolve.js';

const fixtureRoot = fileURLToPath(
  new URL('../fixtures/fragments', import.meta.url)
);

function createPlan(overrides: Partial<CreatePlan> = {}): CreatePlan {
  return {
    targetDir: path.join(tmpdir(), 'stackpress-app'),
    packageName: 'stackpress-app',
    type: 'full-stack',
    database: 'pglite',
    packageManager: 'npm',
    install: false,
    git: false,
    overwrite: false,
    dryRun: false,
    noAgentsMd: false,
    ...overrides
  };
}

async function copyFixture(t: TestContext): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'stackpress-fixture-'));
  const root = path.join(directory, 'fragments');
  await cp(fixtureRoot, root, { recursive: true });
  t.after(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  return root;
}

async function readJson(file: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
}

async function updateJson(
  file: string,
  update: (value: Record<string, unknown>) => void
): Promise<void> {
  const value = await readJson(file);
  update(value);
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

function textFile(
  project: Awaited<ReturnType<typeof resolveProject>>,
  filePath: string
): string {
  const file = project.files.find((candidate) => candidate.path === filePath);
  assert.ok(file, `expected ${filePath} in resolved files`);
  assert.equal(file.binary, false);
  assert.equal(typeof file.contents, 'string');
  return file.contents as string;
}

async function assertGeneration(
  action: Promise<unknown>,
  pattern: RegExp
): Promise<void> {
  await assert.rejects(action, (error: unknown) => {
    assert.ok(error instanceof CliError);
    assert.equal(error.code, 'GENERATION');
    assert.match(error.message, pattern);
    return true;
  });
}

test('resolves a full-stack PGlite project with rendered files', async () => {
  const project = await resolveProject({
    plan: createPlan(),
    templateRoot: fixtureRoot
  });

  assert.deepEqual(
    project.files.map((file) => file.path),
    [
      '.env.sample',
      '.gitignore',
      'README.md',
      'config/capabilities.ts',
      'config/database.ts',
      'plugins/admin/plugin.ts',
      'plugins/api/plugin.ts',
      'plugins/app/plugin.ts',
      'plugins/auth/plugin.ts',
      'plugins/store/connect.ts',
      'public/asset.txt',
      'public/pages/home.tsx',
      'tsconfig.json'
    ]
  );
  assert.equal(
    project.files.some((file) => file.path === 'gitignore'),
    false
  );

  const readme = textFile(project, 'README.md');
  assert.match(readme, /^# stackpress-app$/m);
  assert.match(readme, /Stackpress full-stack project using pglite\./);
  assert.match(readme, /Adapter: @stackpress\/inquire-pglite/);
  assert.match(readme, /Driver: @electric-sql\/pglite/);
  assert.doesNotMatch(readme, /\{\{/);

  const asset = project.files.find((file) => file.path === 'public/asset.txt');
  assert.ok(asset);
  assert.equal(asset.binary, true);
  assert.match(
    Buffer.from(asset.contents as Uint8Array).toString('utf8'),
    /\{\{name\}\}/
  );

  assert.deepEqual(project.capabilities, [
    'views',
    'admin',
    'api',
    'auth',
    'content',
    'database'
  ]);
  assert.deepEqual(project.env, [
    'APP_ENV=development',
    'APP_FEATURE_CONTENT=true',
    'DATABASE_URL=./.build/database',
    'SESSION_SEED=change-me'
  ]);
  assert.match(
    textFile(project, '.env.sample'),
    /DATABASE_URL=\.\/\.build\/database/
  );
  assert.deepEqual(project.plugins, [
    './plugins/admin/plugin',
    './plugins/api/plugin',
    './plugins/app/plugin',
    './plugins/auth/plugin',
    './plugins/store/plugin',
    'stackpress'
  ]);
  assert.deepEqual(project.warnings, []);
  assert.deepEqual(project.packageJson, {
    name: 'stackpress-app',
    private: true,
    type: 'module',
    engines: { node: '>=22' },
    scripts: {
      build: 'stackpress build --b config/build -v',
      dev: 'stackpress serve --b config/develop -v',
      generate: 'stackpress generate --b config/develop -v',
      preview: 'stackpress serve --b config/preview -v',
      push: 'stackpress push --b config/develop -v'
    },
    dependencies: {
      '@electric-sql/pglite': '0.3.15',
      '@stackpress/inquire-pglite': '0.10.8',
      react: '19.2.4',
      'react-dom': '19.2.4',
      stackpress: '0.10.8'
    },
    devDependencies: {
      '@types/react': '19.2.4',
      tsx: '4.23.15',
      typescript: '5.9.3'
    },
    plugins: [
      './plugins/admin/plugin',
      './plugins/api/plugin',
      './plugins/app/plugin',
      './plugins/auth/plugin',
      './plugins/store/plugin',
      'stackpress'
    ]
  });
});

test('resolves every database with the architecture adapter and driver', async () => {
  const expectations: Record<
    DatabaseId,
    { adapter: string; driver: string; version: string }
  > = {
    pglite: {
      adapter: '@stackpress/inquire-pglite',
      driver: '@electric-sql/pglite',
      version: '0.3.15'
    },
    postgres: {
      adapter: '@stackpress/inquire-pg',
      driver: 'pg',
      version: '8.16.3'
    },
    cockroachdb: {
      adapter: '@stackpress/inquire-pg',
      driver: 'pg',
      version: '8.16.3'
    },
    mysql: {
      adapter: '@stackpress/inquire-mysql2',
      driver: 'mysql2',
      version: '3.15.3'
    },
    sqlite: {
      adapter: '@stackpress/inquire-sqlite3',
      driver: 'better-sqlite3',
      version: '12.4.1'
    }
  };

  for (const database of DATABASES) {
    const project = await resolveProject({
      plan: createPlan({ type: 'api-only', database }),
      templateRoot: fixtureRoot
    });
    const expected = expectations[database];
    const dependencies = project.packageJson.dependencies as Record<string, string>;
    assert.equal(dependencies[expected.adapter], '0.10.8');
    assert.equal(dependencies[expected.driver], expected.version);
    const connect = textFile(project, 'plugins/store/connect.ts');
    assert.match(connect, new RegExp(`Adapter: ${escapeRegExp(expected.adapter)}`));
    assert.match(connect, new RegExp(`Driver: ${escapeRegExp(expected.driver)}`));
    assert.equal(project.plan.database, database);
  }
});

test('resolves every project type with the canonical capability set', async () => {
  const expected: Record<ProjectType, string[]> = {
    'full-stack': ['views', 'admin', 'api', 'auth', 'content', 'database'],
    'api-only': ['api', 'auth', 'database'],
    minimal: ['database'],
    'admin-only': ['admin', 'auth', 'database']
  };
  for (const type of PROJECT_TYPES) {
    const project = await resolveProject({
      plan: createPlan({ type, database: 'postgres' }),
      templateRoot: fixtureRoot
    });
    assert.deepEqual(project.capabilities, expected[type]);
  }
});

test('rejects conflicting file contents from different fragments', async (t) => {
  const root = await copyFixture(t);
  const typeFile = path.join(root, 'types', 'full-stack', 'fragment.json');
  await updateJson(typeFile, (value) => {
    const files = value.files as string[];
    files.push('plugins/app/plugin.ts');
  });
  const conflictingFile = path.join(
    root,
    'types',
    'full-stack',
    'plugins',
    'app',
    'plugin.ts'
  );
  await mkdir(path.dirname(conflictingFile), { recursive: true });
  await writeFile(conflictingFile, '// a different app plugin\n');

  await assertGeneration(
    resolveProject({ plan: createPlan(), templateRoot: root }),
    /Conflicting file "plugins\/app\/plugin\.ts"/
  );
});

test('accepts identical duplicate files and warns', async (t) => {
  const root = await copyFixture(t);
  const typeFile = path.join(root, 'types', 'full-stack', 'fragment.json');
  await updateJson(typeFile, (value) => {
    const files = value.files as string[];
    files.push('plugins/app/plugin.ts');
  });
  const source = path.join(root, 'base', 'plugins', 'app', 'plugin.ts');
  const duplicate = path.join(
    root,
    'types',
    'full-stack',
    'plugins',
    'app',
    'plugin.ts'
  );
  await mkdir(path.dirname(duplicate), { recursive: true });
  await writeFile(duplicate, await readFile(source));

  const project = await resolveProject({
    plan: createPlan(),
    templateRoot: root
  });
  assert.equal(project.warnings.length, 1);
  assert.match(project.warnings[0] ?? '', /repeats "plugins\/app\/plugin\.ts"/);
});

test('rejects conflicting package versions', async (t) => {
  const root = await copyFixture(t);
  const typeFile = path.join(root, 'types', 'full-stack', 'fragment.json');
  await updateJson(typeFile, (value) => {
    const packageData = value.package as Record<string, unknown>;
    packageData.dependencies = { stackpress: '0.11.0' };
  });

  await assertGeneration(
    resolveProject({ plan: createPlan(), templateRoot: root }),
    /Conflicting dependency entry "stackpress"/
  );
});

test('rejects conflicting environment keys', async (t) => {
  const root = await copyFixture(t);
  const typeFile = path.join(root, 'types', 'full-stack', 'fragment.json');
  await updateJson(typeFile, (value) => {
    value.env = ['SESSION_SEED=different-seed'];
  });

  await assertGeneration(
    resolveProject({ plan: createPlan(), templateRoot: root }),
    /Conflicting env key "SESSION_SEED"/
  );
});

test('renders allowlisted tokens in environment lines', async (t) => {
  const root = await copyFixture(t);
  await updateJson(
    path.join(root, 'databases', 'pglite', 'fragment.json'),
    (value) => {
      value.env = ['DATABASE_URL={{database}}://{{name}}/{{driver}}'];
    }
  );

  const project = await resolveProject({
    plan: createPlan(),
    templateRoot: root
  });
  assert.ok(
    project.env.includes(
      'DATABASE_URL=pglite://stackpress-app/@electric-sql/pglite'
    )
  );
  assert.match(
    textFile(project, '.env.sample'),
    /DATABASE_URL=pglite:\/\/stackpress-app\/@electric-sql\/pglite/
  );
});

test('rejects unresolved tokens in environment lines', async (t) => {
  const root = await copyFixture(t);
  await updateJson(
    path.join(root, 'databases', 'pglite', 'fragment.json'),
    (value) => {
      value.env = ['DATABASE_URL={{unknown_token}}'];
    }
  );

  await assertGeneration(
    resolveProject({ plan: createPlan(), templateRoot: root }),
    /Unresolved template token.*env "DATABASE_URL"/
  );
});

test('rejects unresolved template tokens', async (t) => {
  const root = await copyFixture(t);
  await appendFile(
    path.join(root, 'base', 'README.md'),
    '\n{{unknown_token}}\n'
  );

  await assertGeneration(
    resolveProject({ plan: createPlan(), templateRoot: root }),
    /Unresolved template token.*\{\{unknown_token\}\}/
  );
});

test('rejects a type fragment with the wrong capability set', async (t) => {
  const root = await copyFixture(t);
  const typeFile = path.join(root, 'types', 'full-stack', 'fragment.json');
  await updateJson(typeFile, (value) => {
    value.capabilities = ['views', 'admin', 'api', 'auth', 'content'];
  });

  await assertGeneration(
    resolveProject({ plan: createPlan(), templateRoot: root }),
    /declares capabilities.*requires/
  );
});

test('rejects capabilities outside the type fragment set', async (t) => {
  const root = await copyFixture(t);
  const databaseFile = path.join(
    root,
    'databases',
    'pglite',
    'fragment.json'
  );
  await updateJson(databaseFile, (value) => {
    value.capabilities = ['database', 'views'];
  });

  await assertGeneration(
    resolveProject({
      plan: createPlan({ type: 'minimal' }),
      templateRoot: root
    }),
    /Merged capabilities.*do not equal/
  );
});

test('rejects missing fragments, files, and requirements', async (t) => {
  const missingFragmentRoot = await copyFixture(t);
  await rm(path.join(missingFragmentRoot, 'databases', 'pglite'), {
    recursive: true,
    force: true
  });
  await assertGeneration(
    resolveProject({ plan: createPlan(), templateRoot: missingFragmentRoot }),
    /fragment "database-pglite" not found/
  );

  const missingFileRoot = await copyFixture(t);
  await updateJson(
    path.join(missingFileRoot, 'base', 'fragment.json'),
    (value) => {
      const files = value.files as string[];
      files.push('missing.txt');
    }
  );
  await assertGeneration(
    resolveProject({ plan: createPlan(), templateRoot: missingFileRoot }),
    /not found.*missing\.txt/
  );

  const unknownRequirementRoot = await copyFixture(t);
  await updateJson(
    path.join(unknownRequirementRoot, 'types', 'full-stack', 'fragment.json'),
    (value) => {
      value.requires = ['base', 'database-sqlite'];
    }
  );
  await assertGeneration(
    resolveProject({
      plan: createPlan(),
      templateRoot: unknownRequirementRoot
    }),
    /requires "database-sqlite".*not part/
  );

  const orderRequirementRoot = await copyFixture(t);
  await updateJson(
    path.join(orderRequirementRoot, 'base', 'fragment.json'),
    (value) => {
      value.requires = ['database-pglite'];
    }
  );
  await assertGeneration(
    resolveProject({
      plan: createPlan(),
      templateRoot: orderRequirementRoot
    }),
    /must be resolved before/
  );
});

test('rejects package.json as a fragment file', async (t) => {
  const root = await copyFixture(t);
  await updateJson(path.join(root, 'base', 'fragment.json'), (value) => {
    const files = value.files as string[];
    files.push('package.json');
  });
  await writeFile(
    path.join(root, 'base', 'package.json'),
    '{"name":"from-template"}\n'
  );

  await assertGeneration(
    resolveProject({ plan: createPlan(), templateRoot: root }),
    /Declare package data in the fragment manifest instead/
  );
});

test('rejects traversal and absolute paths in manifests and indexes', async (t) => {
  const traversalRoot = await copyFixture(t);
  await updateJson(
    path.join(traversalRoot, 'types', 'full-stack', 'fragment.json'),
    (value) => {
      const files = value.files as string[];
      files.push('../escape.ts');
    }
  );
  await assertGeneration(
    resolveProject({ plan: createPlan(), templateRoot: traversalRoot }),
    /relative POSIX path/
  );

  const absoluteRoot = await copyFixture(t);
  await updateJson(
    path.join(absoluteRoot, 'types', 'full-stack', 'fragment.json'),
    (value) => {
      const files = value.files as string[];
      files.push('C:/windows/evil.ts');
    }
  );
  await assertGeneration(
    resolveProject({ plan: createPlan(), templateRoot: absoluteRoot }),
    /relative POSIX path/
  );

  const indexRoot = await copyFixture(t);
  await updateJson(path.join(indexRoot, 'manifest.json'), (value) => {
    const fragments = value.fragments as Array<Record<string, unknown>>;
    const base = fragments.find((entry) => entry.id === 'base');
    assert.ok(base);
    base.path = '../base';
  });
  await assertGeneration(
    resolveProject({ plan: createPlan(), templateRoot: indexRoot }),
    /relative POSIX path/
  );
});

test('rejects symlinked template files when symlinks are available', async (t) => {
  const root = await copyFixture(t);
  const linkPath = path.join(root, 'base', 'linked.txt');
  try {
    await symlink('README.md', linkPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EPERM' || code === 'EACCES' || code === 'UNKNOWN') {
      t.skip(`symlinks are not available on this system (${code})`);
      return;
    }
    throw error;
  }
  assert.equal((await lstat(linkPath)).isSymbolicLink(), true);

  await updateJson(path.join(root, 'base', 'fragment.json'), (value) => {
    const files = value.files as string[];
    files.push('linked.txt');
  });

  await assertGeneration(
    resolveProject({ plan: createPlan(), templateRoot: root }),
    /symbolic link/
  );
});

test('rejects directory junctions and symlinked directories', async (t) => {
  const root = await copyFixture(t);
  const target = path.join(root, 'external-target');
  await mkdir(target, { recursive: true });
  await writeFile(path.join(target, 'note.txt'), 'outside the fragment\n');
  const linkPath = path.join(root, 'base', 'linked-dir');
  try {
    await symlink(target, linkPath, 'junction');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EPERM' || code === 'EACCES' || code === 'UNKNOWN') {
      t.skip(`directory links are not available on this system (${code})`);
      return;
    }
    throw error;
  }
  assert.equal((await lstat(linkPath)).isSymbolicLink(), true);

  await updateJson(path.join(root, 'base', 'fragment.json'), (value) => {
    const files = value.files as string[];
    files.push('linked-dir/note.txt');
  });

  await assertGeneration(
    resolveProject({ plan: createPlan(), templateRoot: root }),
    /symbolic link/
  );
});

test('rejects hard-linked fragment files', async (t) => {
  const root = await copyFixture(t);
  const source = path.join(root, 'base', 'README.md');
  const hardPath = path.join(root, 'base', 'hard.txt');
  try {
    await link(source, hardPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EPERM' || code === 'EACCES' || code === 'UNKNOWN') {
      t.skip(`hard links are not available on this system (${code})`);
      return;
    }
    throw error;
  }
  assert.equal((await lstat(hardPath)).nlink, 2);

  await updateJson(path.join(root, 'base', 'fragment.json'), (value) => {
    (value.files as string[]).push('hard.txt');
  });

  await assertGeneration(
    resolveProject({ plan: createPlan(), templateRoot: root }),
    /hard link/
  );
});

test('rejects hard-linked fragment index and manifest files', async (t) => {
  const indexRoot = await copyFixture(t);
  const index = path.join(indexRoot, 'manifest.json');
  const indexLink = path.join(indexRoot, 'manifest-hard.json');
  try {
    await link(index, indexLink);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EPERM' || code === 'EACCES' || code === 'UNKNOWN') {
      t.skip(`hard links are not available on this system (${code})`);
      return;
    }
    throw error;
  }
  await assertGeneration(
    resolveProject({ plan: createPlan(), templateRoot: indexRoot }),
    /fragment index.*hard link/
  );

  const manifestRoot = await copyFixture(t);
  const manifest = path.join(manifestRoot, 'base', 'fragment.json');
  const manifestLink = path.join(manifestRoot, 'base', 'fragment-hard.json');
  await link(manifest, manifestLink);
  await assertGeneration(
    resolveProject({ plan: createPlan(), templateRoot: manifestRoot }),
    /Fragment manifest.*hard link/
  );
});

test('falls back to canonical fragment paths without an index', async (t) => {
  const root = await copyFixture(t);
  await rm(path.join(root, 'manifest.json'));
  const project = await resolveProject({
    plan: createPlan({ type: 'minimal', database: 'sqlite' }),
    templateRoot: root
  });
  assert.deepEqual(project.capabilities, ['database']);
  assert.ok(project.files.some((file) => file.path === 'plugins/store/connect.ts'));
});

test('rejects a malformed fragment index', async (t) => {
  const root = await copyFixture(t);
  await writeFile(
    path.join(root, 'manifest.json'),
    '{"schemaVersion":2,"fragments":[]}\n'
  );
  await assertGeneration(
    resolveProject({ plan: createPlan(), templateRoot: root }),
    /schemaVersion/
  );
});

test('rejects invalid plan types and databases with usage errors', async () => {
  await assert.rejects(
    resolveProject({
      plan: createPlan({ type: 'blank' as ProjectType }),
      templateRoot: fixtureRoot
    }),
    (error: unknown) => error instanceof CliError && error.code === 'USAGE'
  );
  await assert.rejects(
    resolveProject({
      plan: createPlan({ database: 'oracle' as DatabaseId }),
      templateRoot: fixtureRoot
    }),
    (error: unknown) => error instanceof CliError && error.code === 'USAGE'
  );
});

test('omits AGENTS.md when the plan disables it', async () => {
  const project = await resolveProject({
    plan: createPlan({ noAgentsMd: true })
  });
  assert.equal(
    project.files.some((file) => file.path === 'AGENTS.md'),
    false
  );

  const withAgents = await resolveProject({ plan: createPlan() });
  assert.equal(
    withAgents.files.some((file) => file.path === 'AGENTS.md'),
    true
  );
});

test('defaults the template root to the bundled templates directory', () => {
  const repoRoot = path.dirname(
    fileURLToPath(new URL('../../package.json', import.meta.url))
  );
  assert.equal(defaultTemplateRoot(), path.join(repoRoot, 'templates'));
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
