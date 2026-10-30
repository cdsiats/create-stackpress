import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const SEMVER =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function fail(message) {
  console.error(`release check failed: ${message}`);
  process.exit(1);
}

function parseArguments(args) {
  let tag;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--tag') {
      tag = args[index + 1];
      if (!tag) fail('--tag requires a value, for example --tag v0.2.0');
      index += 1;
    } else {
      fail(`unknown argument: ${argument}`);
    }
  }
  return { tag };
}

function readConstant(source, name) {
  const match = source.match(
    new RegExp(`export const ${name} = ['"]([^'"]+)['"];`)
  );
  if (!match) fail(`src/version.ts is missing ${name}`);
  return match[1];
}

const { tag } = parseArguments(process.argv.slice(2));
const packageJson = JSON.parse(
  await readFile(path.join(REPO_ROOT, 'package.json'), 'utf8')
);
const versionSource = await readFile(
  path.join(REPO_ROOT, 'src', 'version.ts'),
  'utf8'
);
let lockfile;
try {
  lockfile = JSON.parse(
    await readFile(path.join(REPO_ROOT, 'package-lock.json'), 'utf8')
  );
} catch {
  fail('package-lock.json is missing or invalid JSON');
}

const version = packageJson.version;
if (typeof version !== 'string' || !SEMVER.test(version)) {
  fail(`package.json version "${version}" is not a valid semver version`);
}

if (packageJson.private === true) {
  fail('package.json sets "private": true; npm will not publish it');
}

if (lockfile.name !== packageJson.name) {
  fail(
    `package-lock.json name "${lockfile.name}" does not match package.json name "${packageJson.name}"`
  );
}

if (lockfile.version !== version) {
  fail(
    `package-lock.json version "${lockfile.version}" does not match package.json version "${version}"; run npm version to update both`
  );
}

if (lockfile.packages?.['']?.version !== version) {
  fail(
    `package-lock.json root package version "${lockfile.packages?.['']?.version}" does not match package.json version "${version}"`
  );
}

const packageName = readConstant(versionSource, 'PACKAGE_NAME');
if (packageName !== packageJson.name) {
  fail(
    `src/version.ts PACKAGE_NAME "${packageName}" does not match package.json name "${packageJson.name}"`
  );
}

const cliVersion = readConstant(versionSource, 'CLI_VERSION');
if (cliVersion !== version) {
  fail(
    `src/version.ts CLI_VERSION "${cliVersion}" does not match package.json version "${version}"`
  );
}

const templateVersion = readConstant(versionSource, 'TEMPLATE_VERSION');
if (!SEMVER.test(templateVersion)) {
  fail(
    `src/version.ts TEMPLATE_VERSION "${templateVersion}" is not a valid semver version`
  );
}

const stackpressVersion = readConstant(versionSource, 'STACKPRESS_VERSION');
if (!SEMVER.test(stackpressVersion)) {
  fail(
    `src/version.ts STACKPRESS_VERSION "${stackpressVersion}" is not a valid semver version`
  );
}

if (tag !== undefined) {
  if (!tag.startsWith('v')) {
    fail(`tag "${tag}" must start with "v"`);
  }
  if (tag.slice(1) !== version) {
    fail(
      `tag "${tag}" does not match package.json version "${version}"; expected v${version}`
    );
  }
}

console.log(
  `release check passed: ${packageJson.name}@${version} (template ${templateVersion}, stackpress ${stackpressVersion})${
    tag ? ` for tag ${tag}` : ''
  }`
);
