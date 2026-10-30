import { CliError } from '../errors.js';
import type { CreatePlan } from '../types.js';
import {
  compareStrings,
  sortRecord,
  validateFragmentPackage
} from './manifest.js';
import type { FragmentManifest, FragmentPackage, TemplateTokens } from './types.js';
import { renderTokens } from './validate.js';

export type MergedPackage = {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  scripts: Record<string, string>;
  plugins: string[];
};

type PackageInput = Pick<FragmentManifest, 'id' | 'package'>;

function fail(message: string, hint?: string): never {
  throw CliError.generation(message, hint);
}

function mergeStringMap(
  target: Record<string, string>,
  owners: Map<string, string>,
  source: Record<string, string> | undefined,
  field: string,
  owner: string
): void {
  if (!source) return;
  for (const key of Object.keys(source).sort(compareStrings)) {
    const value = source[key];
    if (value === undefined) continue;
    const existing = target[key];
    if (existing === undefined) {
      target[key] = value;
      owners.set(key, owner);
      continue;
    }
    const existingOwner = owners.get(key) ?? 'another fragment';
    if (existing !== value) {
      fail(
        `Conflicting ${field} entry "${key}" between fragments "${existingOwner}" and "${owner}": "${existing}" and "${value}".`
      );
    }
  }
}

export function mergePackageFragments(
  fragments: ReadonlyArray<PackageInput>
): MergedPackage {
  const dependencies: Record<string, string> = {};
  const devDependencies: Record<string, string> = {};
  const scripts: Record<string, string> = {};
  const dependencyOwners = new Map<string, string>();
  const devDependencyOwners = new Map<string, string>();
  const scriptOwners = new Map<string, string>();
  const plugins = new Set<string>();

  for (const fragment of fragments) {
    if (!fragment.package) continue;
    const packageData = validateFragmentPackage(
      fragment.package,
      `fragment "${fragment.id}"`
    );
    mergeStringMap(
      dependencies,
      dependencyOwners,
      packageData.dependencies,
      'dependency',
      fragment.id
    );
    mergeStringMap(
      devDependencies,
      devDependencyOwners,
      packageData.devDependencies,
      'devDependency',
      fragment.id
    );
    mergeStringMap(
      scripts,
      scriptOwners,
      packageData.scripts,
      'script',
      fragment.id
    );
    for (const plugin of packageData.plugins ?? []) {
      plugins.add(plugin);
    }
  }

  return {
    dependencies: sortRecord(dependencies),
    devDependencies: sortRecord(devDependencies),
    scripts: sortRecord(scripts),
    plugins: [...plugins].sort(compareStrings)
  };
}

function renderStringMap(
  values: Record<string, string>,
  tokens: TemplateTokens
): Record<string, string> {
  const rendered: Record<string, string> = {};
  for (const key of Object.keys(values).sort(compareStrings)) {
    const value = values[key];
    if (value === undefined) continue;
    rendered[key] = renderTokens(value, tokens);
  }
  return sortRecord(rendered);
}

export function renderPackageJson(
  plan: Pick<CreatePlan, 'packageName'>,
  packageData: FragmentPackage,
  tokens: TemplateTokens = {}
): Record<string, unknown> {
  if (typeof plan.packageName !== 'string' || plan.packageName.length === 0) {
    throw CliError.usage('A package name is required to render package.json.');
  }

  const merged = mergePackageFragments([
    { id: 'package data', package: packageData }
  ]);
  const dependencies = renderStringMap(merged.dependencies, tokens);
  const devDependencies = renderStringMap(merged.devDependencies, tokens);
  const scripts = renderStringMap(merged.scripts, tokens);
  const plugins = [
    ...new Set(merged.plugins.map((plugin) => renderTokens(plugin, tokens)))
  ].sort(compareStrings);

  const packageJson: Record<string, unknown> = {
    name: plan.packageName,
    private: true,
    type: 'module',
    engines: { node: '>=22' }
  };
  if (Object.keys(scripts).length > 0) packageJson.scripts = scripts;
  if (Object.keys(dependencies).length > 0) {
    packageJson.dependencies = dependencies;
  }
  if (Object.keys(devDependencies).length > 0) {
    packageJson.devDependencies = devDependencies;
  }
  if (plugins.length > 0) packageJson.plugins = plugins;
  return packageJson;
}
