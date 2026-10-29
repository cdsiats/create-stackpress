import { base, databases, types } from './manifest.mjs';

function sortObject(value) {
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
}

export function mergePackages(...packages) {
  const merged = {
    scripts: {},
    dependencies: {},
    devDependencies: {},
    plugins: []
  };

  for (const pkg of packages) {
    for (const section of ['scripts', 'dependencies', 'devDependencies']) {
      for (const [name, version] of Object.entries(pkg[section] || {})) {
        if (merged[section][name] && merged[section][name] !== version) {
          throw new Error(`Package conflict for ${section}.${name}: ${merged[section][name]} vs ${version}`);
        }
        merged[section][name] = version;
      }
    }

    for (const plugin of pkg.plugins || []) {
      if (!merged.plugins.includes(plugin)) merged.plugins.push(plugin);
    }
  }

  return merged;
}

export function addFiles(target, source, label) {
  for (const [file, content] of Object.entries(source)) {
    if (target[file] !== undefined && target[file] !== content) {
      throw new Error(`File conflict for ${file} while merging ${label}`);
    }
    target[file] = content;
  }
}

function applyReplacements(content, replacements) {
  let result = content;
  for (const [token, value] of Object.entries(replacements)) {
    result = result.split(token).join(value);
  }
  return result;
}

export function compose(typeId, dbId) {
  const type = types[typeId];
  const db = databases[dbId];

  if (!type) throw new Error(`Unknown project type: ${typeId}`);
  if (!db) throw new Error(`Unknown database: ${dbId}`);

  const files = {};
  addFiles(files, base.files, 'base');
  addFiles(files, type.files, `type:${typeId}`);
  addFiles(files, db.files, `db:${dbId}`);

  const envLines = new Set(
    (files['.env.sample'] || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  );
  envLines.add(db.env);
  files['.env.sample'] = `${[...envLines].join('\n')}\n`;

  const merged = mergePackages(base.package, type.package, db.package);
  const name = `proof-${typeId}-${dbId}`.replace(/[^a-z0-9-]/g, '-');
  const packageJson = {
    name,
    version: '0.0.0',
    private: true,
    type: 'module',
    scripts: sortObject(merged.scripts),
    plugins: merged.plugins,
    dependencies: sortObject(merged.dependencies),
    devDependencies: sortObject(merged.devDependencies)
  };

  files['package.json'] = `${JSON.stringify(packageJson, null, 2)}\n`;

  const replacements = {
    '{{NAME}}': name,
    '{{TYPE}}': typeId,
    '{{TYPE_LABEL}}': type.label,
    '{{DATABASE}}': dbId,
    '{{DATABASE_LABEL}}': db.label,
    '{{ADAPTER}}': db.adapter,
    '{{DRIVER}}': db.driver
  };

  for (const [file, content] of Object.entries(files)) {
    files[file] = applyReplacements(content, replacements);
  }

  for (const [file, content] of Object.entries(files)) {
    if (content.includes('{{')) {
      throw new Error(`Unresolved placeholder in ${file}`);
    }
  }

  return { name, files, packageJson, type, db };
}

export function allCombinations() {
  return Object.keys(types).flatMap((typeId) => (
    Object.keys(databases).map((dbId) => [typeId, dbId])
  ));
}
