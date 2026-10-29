import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const stackpressVersion = '0.10.8';
const here = path.dirname(fileURLToPath(import.meta.url));

const mapping = [
  {
    database: 'CockroachDB',
    adapter: '@stackpress/inquire-pg',
    driver: 'pg',
    pinned: '8.16.3',
    dialect: 'pgsql'
  },
  {
    database: 'PostgreSQL',
    adapter: '@stackpress/inquire-pg',
    driver: 'pg',
    pinned: '8.16.3',
    dialect: 'pgsql'
  },
  {
    database: 'MySQL',
    adapter: '@stackpress/inquire-mysql2',
    driver: 'mysql2',
    pinned: '3.15.3',
    dialect: 'mysql'
  },
  {
    database: 'SQLite',
    adapter: '@stackpress/inquire-sqlite3',
    driver: 'better-sqlite3',
    pinned: '12.4.1',
    dialect: 'sqlite'
  },
  {
    database: 'PGlite',
    adapter: '@stackpress/inquire-pglite',
    driver: '@electric-sql/pglite',
    pinned: '0.3.15',
    dialect: 'pglite'
  }
];

function satisfiesCaret(version, range) {
  if (!range.startsWith('^')) return false;
  const current = version.split('.').map(Number);
  const wanted = range.slice(1).split('.').map(Number);

  if (wanted[0] === 0) {
    return current[0] === 0
      && current[1] === wanted[1]
      && (wanted[2] === undefined || current[2] >= wanted[2]);
  }

  return current[0] === wanted[0];
}

async function getJson(url) {
  const response = await fetch(url);
  assert.equal(response.ok, true, `Request failed: ${url} (HTTP ${response.status})`);
  return response.json();
}

function registryUrl(name) {
  return `https://registry.npmjs.org/${encodeURIComponent(name)}`;
}

const stackpress = await getJson(`https://registry.npmjs.org/stackpress/${stackpressVersion}`);
const results = [];

for (const item of mapping) {
  const adapter = await getJson(registryUrl(item.adapter));
  const version = adapter.versions?.[stackpressVersion];

  assert.ok(version, `${item.adapter} ${stackpressVersion} is missing`);
  assert.ok(
    version.peerDependencies?.[item.driver],
    `${item.adapter} does not declare ${item.driver} as a peer dependency`
  );
  assert.ok(
    version.exports?.['.']?.import,
    `${item.adapter} has no ESM root export`
  );
  assert.ok(
    stackpress.exports?.[`./${item.dialect}`]?.import,
    `stackpress ${stackpressVersion} has no ./${item.dialect} export`
  );

  const driver = await getJson(registryUrl(item.driver));
  const latest = driver['dist-tags']?.latest;
  const peer = version.peerDependencies[item.driver];

  assert.ok(latest, `${item.driver} has no latest version`);
  assert.ok(
    satisfiesCaret(item.pinned, peer),
    `${item.driver}@${item.pinned} does not satisfy peer range ${peer}`
  );

  const latestSatisfies = satisfiesCaret(latest, peer);
  results.push({
    database: item.database,
    adapter: item.adapter,
    adapterVersion: version.version,
    driver: item.driver,
    driverPinned: item.pinned,
    driverLatest: latest,
    latestSatisfies,
    peer,
    dialectExport: `stackpress/${item.dialect}`
  });

  console.log(
    `PASS ${item.database}: ${item.adapter}@${version.version} + ${item.driver}@${item.pinned} (peer ${peer}) -> stackpress/${item.dialect}`
  );

  if (!latestSatisfies) {
    console.log(
      `NOTE ${item.driver} latest ${latest} is outside ${peer}; the generated project must pin ${item.pinned}.`
    );
  }
}

const crdbExample = await getJson(
  'https://raw.githubusercontent.com/stackpress/inquire/main/examples/with-crdb/package.json'
);
assert.equal(crdbExample.dependencies['@stackpress/inquire-pg'], stackpressVersion);
assert.equal(crdbExample.dependencies.pg, '8.16.3');
console.log('PASS: CockroachDB example uses @stackpress/inquire-pg + pg');

const pgliteEntry = path.resolve(
  here,
  '../003-minimal-stackpress-pglite/node_modules/@stackpress/inquire-pglite/esm/index.js'
);

try {
  await access(pgliteEntry);
  const pglite = await import(pathToFileURL(pgliteEntry).href);
  assert.equal(typeof pglite.connect, 'function', 'PGlite adapter connect export is missing');
  assert.equal(typeof pglite.default, 'function', 'PGlite adapter default export is missing');
  console.log('PASS: PGlite adapter root import exposes connect and default');
} catch (error) {
  if (error?.code === 'ENOENT') {
    console.log('SKIP: PGlite import check (run P-003 npm install first)');
  } else {
    throw error;
  }
}

console.log('');
console.log(`PASS: ${results.length}/5 database mappings resolved`);
console.log(JSON.stringify({ stackpressVersion, results }, null, 2));
