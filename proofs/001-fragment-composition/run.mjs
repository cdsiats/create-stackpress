import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { allCombinations, addFiles, compose, mergePackages } from './compose.mjs';

const outRoot = path.resolve('out');
rmSync(outRoot, { recursive: true, force: true });
mkdirSync(outRoot, { recursive: true });

const combinations = allCombinations();
assert.equal(combinations.length, 20, 'Expected 4 project types x 5 databases = 20 combinations');

const typeExpectations = {
  'full-stack': {
    required: [
      'config/capabilities.ts',
      'plugins/app/pages/home.ts',
      'plugins/app/views/home.tsx',
      'plugins/admin/plugin.ts',
      'plugins/api/plugin.ts'
    ],
    forbidden: []
  },
  'api-only': {
    required: ['config/capabilities.ts', 'plugins/api/plugin.ts'],
    forbidden: ['plugins/app/views/home.tsx', 'plugins/admin/plugin.ts']
  },
  minimal: {
    required: ['config/capabilities.ts'],
    forbidden: ['plugins/admin/plugin.ts', 'plugins/api/plugin.ts', 'plugins/app/views/home.tsx']
  },
  'admin-only': {
    required: ['config/capabilities.ts', 'plugins/admin/plugin.ts'],
    forbidden: ['plugins/api/plugin.ts', 'plugins/app/views/home.tsx']
  }
};

const expectedCapabilities = {
  'full-stack': ['views', 'admin', 'api', 'auth', 'database', 'content'],
  'api-only': ['api', 'auth', 'database'],
  minimal: ['database'],
  'admin-only': ['admin', 'auth', 'database']
};

const results = [];

for (const [typeId, dbId] of combinations) {
  const result = compose(typeId, dbId);
  const { files, packageJson, type, db } = result;

  assert.equal(packageJson.type, 'module', `${result.name}: type must be module`);
  assert.equal(packageJson.private, true, `${result.name}: package must be private`);
  assert.ok(packageJson.plugins.includes('./plugins/app/plugin'), `${result.name}: base plugin missing`);
  assert.ok(packageJson.plugins.includes('./plugins/store/plugin'), `${result.name}: store plugin missing`);

  assert.ok(files['plugins/app/plugin.ts'], `${result.name}: app plugin missing`);
  assert.ok(files['plugins/store/plugin.ts'], `${result.name}: store plugin missing`);
  assert.ok(files['plugins/store/connect.ts'], `${result.name}: store connect missing`);
  assert.ok(files['config/database.ts'], `${result.name}: database config missing`);
  assert.ok(files['config/capabilities.ts'], `${result.name}: capabilities config missing`);
  assert.ok(files['AGENTS.md'], `${result.name}: AGENTS.md missing`);
  assert.ok(files['README.md'], `${result.name}: README missing`);

  assert.equal(packageJson.dependencies[db.adapter], '0.10.8', `${result.name}: adapter dependency missing`);
  assert.equal(packageJson.dependencies[db.driver], db.driverVersion, `${result.name}: driver dependency missing`);

  const capabilities = expectedCapabilities[typeId];
  const capabilitiesFile = files['config/capabilities.ts'];
  for (const capability of capabilities) {
    assert.ok(capabilitiesFile.includes(`'${capability}'`), `${result.name}: capability ${capability} missing`);
  }

  const expectation = typeExpectations[typeId];
  for (const file of expectation.required) {
    assert.ok(files[file], `${result.name}: expected ${file}`);
  }
  for (const file of expectation.forbidden) {
    assert.ok(!files[file], `${result.name}: forbidden ${file} present`);
  }

  assert.ok(files['.env.sample'].includes(db.env), `${result.name}: database env missing`);
  assert.ok(files['README.md'].includes(type.label), `${result.name}: README type missing`);
  assert.ok(files['README.md'].includes(db.label), `${result.name}: README database missing`);

  for (const [file, content] of Object.entries(files)) {
    assert.ok(!content.includes('{{'), `${result.name}: unresolved placeholder in ${file}`);
  }

  const target = path.join(outRoot, result.name);
  mkdirSync(target, { recursive: true });
  for (const [file, content] of Object.entries(files)) {
    const filePath = path.join(target, file);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
  }

  results.push({
    name: result.name,
    type: typeId,
    database: dbId,
    files: Object.keys(files).length,
    plugins: packageJson.plugins.length,
    dependencies: Object.keys(packageJson.dependencies).length
  });

  console.log(`PASS ${result.name} (${Object.keys(files).length} files, ${packageJson.plugins.length} plugins)`);
}

assert.throws(
  () => mergePackages(
    { dependencies: { example: '1.0.0' } },
    { dependencies: { example: '2.0.0' } }
  ),
  /Package conflict/,
  'Package conflict detection must fail'
);

assert.throws(
  () => addFiles({ 'same.txt': 'a' }, { 'same.txt': 'b' }, 'test'),
  /File conflict/,
  'File conflict detection must fail'
);

assert.throws(() => compose('unknown-type', 'pglite'), /Unknown project type/);
assert.throws(() => compose('full-stack', 'unknown-db'), /Unknown database/);

writeFileSync(
  path.join(outRoot, 'manifest.json'),
  `${JSON.stringify({ combinations: results.length, results }, null, 2)}\n`
);

console.log('');
console.log(`PASS: ${results.length}/20 combinations composed with no conflicts`);
console.log('PASS: package conflict detection');
console.log('PASS: file conflict detection');
console.log('PASS: unknown type and database rejection');
