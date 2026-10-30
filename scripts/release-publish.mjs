import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const REGISTRY = 'https://registry.npmjs.org';

function fail(message) {
  console.error(`release publish failed: ${message}`);
  process.exit(1);
}

function parseArguments(args) {
  let tarball;
  let tag;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--tarball') {
      tarball = args[index + 1];
      if (!tarball) fail('--tarball requires a path');
      index += 1;
    } else if (argument === '--tag') {
      tag = args[index + 1];
      if (!tag) fail('--tag requires a dist-tag such as next or latest');
      index += 1;
    } else {
      fail(`unknown argument: ${argument}`);
    }
  }
  if (!tarball) fail('--tarball is required');
  return { tarball: path.resolve(REPO_ROOT, tarball), tag };
}

function integrityOf(buffer) {
  return `sha512-${createHash('sha512').update(buffer).digest('base64')}`;
}

function shasumOf(buffer) {
  return createHash('sha1').update(buffer).digest('hex');
}

const { tarball, tag } = parseArguments(process.argv.slice(2));
const packageJson = JSON.parse(
  await readFile(path.join(REPO_ROOT, 'package.json'), 'utf8')
);
const { name, version } = packageJson;
const distTag = tag ?? (version.includes('-') ? 'next' : 'latest');

if (!name || !version) fail('package.json must include name and version');

let tarballBytes;
try {
  tarballBytes = await readFile(tarball);
} catch {
  fail(`cannot read tarball ${tarball}`);
}
const integrity = integrityOf(tarballBytes);
const shasum = shasumOf(tarballBytes);

const metadataUrl = `${REGISTRY}/${encodeURIComponent(name)}/${encodeURIComponent(version)}`;
let existing;
try {
  const response = await fetch(metadataUrl, {
    headers: { accept: 'application/json' }
  });
  if (response.status === 404) {
    existing = null;
  } else if (!response.ok) {
    fail(
      `registry returned ${response.status} ${response.statusText} for ${name}@${version}`
    );
  } else {
    existing = await response.json();
  }
} catch (error) {
  fail(
    `could not query the registry for ${name}@${version}: ${
      error instanceof Error ? error.message : String(error)
    }`
  );
}

if (existing) {
  const registryIntegrity = existing.dist?.integrity;
  const registryShasum = existing.dist?.shasum;
  const sameContents = registryIntegrity
    ? registryIntegrity === integrity
    : registryShasum === shasum;

  if (!sameContents) {
    fail(
      `${name}@${version} is already published with different contents ` +
        `(registry ${registryIntegrity ?? registryShasum ?? 'unknown'}, ` +
        `local ${integrity}). Bump the version instead of reusing it.`
    );
  }

  console.log(
    `${name}@${version} is already published with identical contents; skipping publish.`
  );
  process.exit(0);
}

console.log(
  `publishing ${name}@${version} with dist-tag "${distTag}" from ${tarball}`
);
const result = spawnSync(
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['publish', tarball, '--access', 'public', '--tag', distTag],
  {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  }
);

if (result.error) {
  fail(result.error.message);
}
process.exit(result.status ?? 1);
