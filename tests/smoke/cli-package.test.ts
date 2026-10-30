import assert from 'node:assert/strict';
import { existsSync, promises as fsp } from 'node:fs';
import path from 'node:path';
import { after, before, test } from 'node:test';
import {
  cleanupTempRoots,
  describeCommandFailure,
  ensureBuilt,
  listFiles,
  readJson,
  REPO_ROOT,
  runCli,
  runInstalledCli,
  runNpm,
  tempRoot,
  temporaryEntries
} from './helpers.js';

const SMOKE_ENABLED = process.env.CREATE_STACKPRESS_SMOKE === '1';
const HEAVY_SKIP = SMOKE_ENABLED
  ? false
  : 'set CREATE_STACKPRESS_SMOKE=1 to install the packed tarball and build a generated project';

const INSTALLED_PACKAGE = path.join(
  'node_modules',
  '@cdsiats',
  'create-stackpress'
);

type PackEntry = {
  filename: string;
  entryCount: number;
  files: Array<{ path: string; size: number; mode: number }>;
};

before(async () => {
  await ensureBuilt();
});

after(async () => {
  await cleanupTempRoots();
});

function parsePackOutput(stdout: string): PackEntry {
  const parsed = JSON.parse(stdout) as PackEntry[];
  assert.ok(parsed.length > 0, 'npm pack returned no package entries');
  return parsed[0] as PackEntry;
}

function packTarball(packDestination: string): { entry: PackEntry; tarball: string } {
  const result = runNpm(
    ['pack', '--json', '--pack-destination', packDestination],
    { cwd: REPO_ROOT, timeout: 120_000 }
  );
  assert.equal(
    result.status,
    0,
    describeCommandFailure('npm pack', result)
  );
  const entry = parsePackOutput(result.stdout);
  return {
    entry,
    tarball: path.join(packDestination, entry.filename)
  };
}

test('the built CLI prints version and help', () => {
  const version = runCli(['--version']);
  assert.equal(
    version.status,
    0,
    describeCommandFailure('create-stackpress --version', version)
  );
  assert.match(version.stdout, /create-stackpress \d+\.\d+\.\d+/);
  assert.match(version.stdout, /template \d+\.\d+\.\d+/);
  assert.match(version.stdout, /stackpress 0\.10\.8/);

  const help = runCli(['--help']);
  assert.equal(
    help.status,
    0,
    describeCommandFailure('create-stackpress --help', help)
  );
  assert.match(help.stdout, /Usage:\s*\n\s+create-stackpress \[directory\] \[options\]/);
  assert.match(help.stdout, /--dry-run/);
  assert.match(help.stdout, /--no-input/);
});

test('the built CLI maps usage errors to exit code 2', () => {
  const unknown = runCli(['--definitely-unknown']);
  assert.equal(
    unknown.status,
    2,
    describeCommandFailure('create-stackpress --definitely-unknown', unknown)
  );
  assert.match(unknown.stderr, /Error:/);

  const missingDirectory = runCli([]);
  assert.equal(
    missingDirectory.status,
    2,
    describeCommandFailure('create-stackpress without a directory', missingDirectory)
  );
  assert.match(missingDirectory.stderr, /Missing target directory/);
});

test('the built CLI generates a full-stack/PGlite project', async () => {
  const root = await tempRoot('create-stackpress-cli-');
  const target = path.join(root, 'full-stack-app');

  const result = runCli(
    [
      target,
      '--type',
      'full-stack',
      '--db',
      'pglite',
      '--pm',
      'npm',
      '--no-install',
      '--no-git',
      '--no-input',
      '--no-color'
    ],
    { cwd: root }
  );

  assert.equal(
    result.status,
    0,
    describeCommandFailure('create-stackpress full-stack/PGlite', result)
  );
  assert.match(result.stdout, /Created /);
  assert.match(result.stdout, /Pinned versions: stackpress 0\.10\.8/);
  assert.match(result.stdout, /@electric-sql\/pglite 0\.3\.15/);
  assert.match(result.stdout, /PGlite runs locally/);
  assert.deepEqual(await temporaryEntries(root), []);

  const files = await listFiles(target);
  for (const required of [
    '.env.sample',
    '.gitignore',
    'AGENTS.md',
    'README.md',
    'config/common.ts',
    'config/develop.ts',
    'package.json',
    'plugins/store/connect.ts',
    'public/favicon.ico',
    'public/favicon.png',
    'public/icon.png',
    'public/logo.png',
    'public/styles/global.css',
    'schema.idea',
    'scripts/stackpress.ts',
    'tsconfig.json'
  ]) {
    assert.ok(files.includes(required), `missing generated file ${required}`);
  }

  const packageJson = await readJson(path.join(target, 'package.json'));
  assert.equal(packageJson.name, 'full-stack-app');
  assert.equal(packageJson.dependencies.stackpress, '0.10.8');
  assert.equal(packageJson.dependencies['@electric-sql/pglite'], '0.3.15');
  assert.equal(
    packageJson.dependencies['@stackpress/inquire-pglite'],
    '0.10.8'
  );

  assert.match(
    result.stdout,
    /\(views, admin, api, auth, content, database\)/
  );

  const connect = await fsp.readFile(
    path.join(target, 'plugins', 'store', 'connect.ts'),
    'utf8'
  );
  assert.match(connect, /new PGlite\(/);
  assert.match(connect, /@electric-sql\/pglite/);

  const readme = await fsp.readFile(path.join(target, 'README.md'), 'utf8');
  assert.match(readme, /full-stack/);
  assert.match(readme, /pglite/);
  assert.match(readme, /npm run dev/);
});

test('the built CLI generates an API-only/PostgreSQL project', async () => {
  const root = await tempRoot('create-stackpress-cli-');
  const target = path.join(root, 'api-app');

  const result = runCli(
    [
      target,
      '--type',
      'api-only',
      '--db',
      'postgres',
      '--pm',
      'npm',
      '--no-install',
      '--no-git',
      '--no-input',
      '--no-color'
    ],
    { cwd: root }
  );

  assert.equal(
    result.status,
    0,
    describeCommandFailure('create-stackpress api-only/Postgres', result)
  );
  assert.match(result.stdout, /PostgreSQL must be running/);
  assert.deepEqual(await temporaryEntries(root), []);

  const packageJson = await readJson(path.join(target, 'package.json'));
  assert.equal(packageJson.name, 'api-app');
  assert.equal(packageJson.dependencies['@stackpress/inquire-pg'], '0.10.8');
  assert.equal(packageJson.dependencies.pg, '8.16.3');
  assert.equal(packageJson.devDependencies['@types/pg'], '8.16.0');

  for (const excluded of ['plugins/admin', 'plugins/content', 'plugins/views']) {
    assert.equal(
      existsSync(path.join(target, ...excluded.split('/'))),
      false,
      `API-only project should not contain ${excluded}`
    );
  }

  assert.match(result.stdout, /\(api, auth, database\)/);

  const envSample = await fsp.readFile(path.join(target, '.env.sample'), 'utf8');
  assert.match(
    envSample,
    /DATABASE_URL=postgres:\/\/postgres:postgres@localhost:5432\/app/
  );

  const connect = await fsp.readFile(
    path.join(target, 'plugins', 'store', 'connect.ts'),
    'utf8'
  );
  assert.match(connect, /stackpress\/pgsql/);
  assert.match(connect, /new Client\(/);
});

test('the package dry run lists dist, templates, README, and package metadata', () => {
  const result = runNpm(['pack', '--dry-run', '--json'], {
    cwd: REPO_ROOT,
    timeout: 120_000
  });
  assert.equal(
    result.status,
    0,
    describeCommandFailure('npm pack --dry-run --json', result)
  );

  const entry = parsePackOutput(result.stdout);
  const paths = new Set(entry.files.map((file) => file.path));

  for (const required of [
    'README.md',
    'package.json',
    'dist/cli.js',
    'templates/manifest.json',
    'templates/base/manifest.json',
    'templates/base/public/favicon.ico',
    'templates/base/public/favicon.png',
    'templates/base/public/icon.png',
    'templates/base/public/logo.png',
    'templates/base/public/styles/global.css'
  ]) {
    assert.ok(paths.has(required), `packed tarball is missing ${required}`);
  }

  for (const type of ['full-stack', 'api-only', 'minimal', 'admin-only']) {
    assert.ok(
      paths.has(`templates/types/${type}/manifest.json`),
      `packed tarball is missing type fragment ${type}`
    );
  }

  for (const database of ['pglite', 'postgres', 'cockroachdb', 'mysql', 'sqlite']) {
    assert.ok(
      paths.has(`templates/databases/${database}/manifest.json`),
      `packed tarball is missing database fragment ${database}`
    );
  }

  for (const packedPath of paths) {
    assert.equal(packedPath.startsWith('tests/'), false, `tests leaked: ${packedPath}`);
    assert.equal(packedPath.startsWith('src/'), false, `src leaked: ${packedPath}`);
    assert.equal(packedPath.startsWith('scripts/'), false, `scripts leaked: ${packedPath}`);
    assert.equal(packedPath.startsWith('.github/'), false, `.github leaked: ${packedPath}`);
    assert.equal(packedPath.startsWith('.agents/'), false, `.agents leaked: ${packedPath}`);
  }

  assert.ok(entry.entryCount >= 100, `unexpectedly small package (${entry.entryCount} files)`);
});

test(
  'the packed tarball installs and runs the CLI from a temporary directory',
  { skip: HEAVY_SKIP, timeout: 600_000 },
  async () => {
    const root = await tempRoot('create-stackpress-packed-');
    const packDir = path.join(root, 'pack');
    const installDir = path.join(root, 'install');
    await fsp.mkdir(packDir);
    await fsp.mkdir(installDir);

    const { tarball } = packTarball(packDir);
    assert.ok(existsSync(tarball), `npm pack did not create ${tarball}`);

    const install = runNpm(
      [
        'install',
        '--no-save',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--loglevel=error',
        tarball
      ],
      {
        cwd: installDir,
        timeout: 300_000,
        env: {
          npm_config_update_notifier: 'false',
          npm_config_progress: 'false'
        }
      }
    );
    assert.equal(
      install.status,
      0,
      describeCommandFailure('npm install of the packed tarball', install)
    );

    const installedPackage = path.join(installDir, INSTALLED_PACKAGE);
    for (const required of ['dist/cli.js', 'templates/manifest.json', 'README.md']) {
      assert.ok(
        existsSync(path.join(installedPackage, ...required.split('/'))),
        `installed package is missing ${required}`
      );
    }

    const shim = path.join(
      installDir,
      'node_modules',
      '.bin',
      process.platform === 'win32' ? 'create-stackpress.cmd' : 'create-stackpress'
    );
    assert.ok(existsSync(shim), `npm did not create the bin shim at ${shim}`);

    const version = runInstalledCli(installedPackage, ['--version'], {
      cwd: installDir
    });
    assert.equal(
      version.status,
      0,
      describeCommandFailure('installed create-stackpress --version', version)
    );
    assert.match(version.stdout, /create-stackpress \d+\.\d+\.\d+/);

    const help = runInstalledCli(installedPackage, ['--help'], {
      cwd: installDir
    });
    assert.equal(
      help.status,
      0,
      describeCommandFailure('installed create-stackpress --help', help)
    );
    assert.match(help.stdout, /Usage:/);

    const generated = path.join(root, 'packed-app');
    const generation = runInstalledCli(
      installedPackage,
      [
        generated,
        '--type',
        'minimal',
        '--db',
        'pglite',
        '--no-install',
        '--no-git',
        '--no-input',
        '--no-color'
      ],
      { cwd: installDir }
    );
    assert.equal(
      generation.status,
      0,
      describeCommandFailure('installed create-stackpress generation', generation)
    );

    const files = await listFiles(generated);
    for (const required of ['package.json', 'README.md', '.env.sample', 'plugins/store/connect.ts']) {
      assert.ok(files.includes(required), `packed CLI did not generate ${required}`);
    }
  }
);

test(
  'a generated full-stack/PGlite project installs and builds',
  { skip: HEAVY_SKIP, timeout: 1_200_000 },
  async () => {
    const root = await tempRoot('create-stackpress-generate-');
    const target = path.join(root, 'full-stack-app');

    const generation = runCli(
      [
        target,
        '--type',
        'full-stack',
        '--db',
        'pglite',
        '--pm',
        'npm',
        '--no-install',
        '--no-git',
        '--no-input',
        '--no-color'
      ],
      { cwd: root }
    );
    assert.equal(
      generation.status,
      0,
      describeCommandFailure('create-stackpress full-stack generation', generation)
    );

    const install = runNpm(
      ['install', '--no-audit', '--no-fund', '--loglevel=error'],
      {
        cwd: target,
        timeout: 900_000,
        env: {
          npm_config_update_notifier: 'false',
          npm_config_progress: 'false'
        }
      }
    );
    assert.equal(
      install.status,
      0,
      describeCommandFailure('npm install in the generated project', install)
    );

    const build = runNpm(['run', 'build'], {
      cwd: target,
      timeout: 300_000
    });
    assert.equal(
      build.status,
      0,
      describeCommandFailure('npm run build in the generated project', build)
    );

    assert.ok(existsSync(path.join(target, 'node_modules', 'stackpress')));
    assert.ok(existsSync(path.join(target, 'node_modules', '@electric-sql', 'pglite')));
  }
);
