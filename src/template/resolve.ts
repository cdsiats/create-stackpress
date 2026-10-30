import path from 'node:path';
import { CliError } from '../errors.js';
import type { CreatePlan } from '../types.js';
import { mergeEnvironment } from './environment.js';
import {
  addFragmentFile,
  assertFragmentRequires,
  defaultTemplateRoot,
  findFragmentEntry,
  resolveFragmentCapabilities,
  resolveFragmentDirectory
} from './fragments.js';
import {
  canonicalFragmentIndex,
  compareStrings,
  getDatabaseMetadata,
  loadFragmentIndex,
  loadFragmentManifest
} from './manifest.js';
import type { FragmentIndexEntry } from './manifest.js';
import { mergePackageFragments, renderPackageJson } from './package.js';
import { assertTemplatePlan } from './plan-guard.js';
import type {
  FragmentManifest,
  ResolvedFile,
  ResolvedProject,
  TemplateTokens
} from './types.js';
import { validateResolvedProject } from './validate.js';

export type ResolveProjectInput = {
  plan: CreatePlan;
  templateRoot?: string;
};

export type ResolveProjectOptions = ResolveProjectInput;

export type { EnvEntry } from './environment.js';
export { defaultTemplateRoot } from './fragments.js';

export async function resolveProject(
  input: ResolveProjectInput
): Promise<ResolvedProject> {
  const { plan } = input;
  assertTemplatePlan(plan, 'resolve templates');

  const templateRoot = path.resolve(input.templateRoot ?? defaultTemplateRoot());
  const index =
    (await loadFragmentIndex(templateRoot)) ?? canonicalFragmentIndex();

  const entries: FragmentIndexEntry[] = [
    findFragmentEntry(index, 'base', 'base', 'base'),
    findFragmentEntry(index, plan.type, 'type', 'project type'),
    findFragmentEntry(
      index,
      `database-${plan.database}`,
      'database',
      'database'
    )
  ];

  const manifests: FragmentManifest[] = [];
  const fragmentDirectories: string[] = [];
  for (const entry of entries) {
    const directory = await resolveFragmentDirectory(templateRoot, entry);
    const manifest = await loadFragmentManifest(directory);
    if (manifest.id !== entry.id) {
      throw CliError.generation(
        `Fragment manifest id "${manifest.id}" does not match the index id "${entry.id}".`
      );
    }
    if (manifest.kind !== entry.kind) {
      throw CliError.generation(
        `Fragment "${entry.id}" manifest kind "${manifest.kind}" does not match the index kind "${entry.kind}".`
      );
    }
    manifests.push(manifest);
    fragmentDirectories.push(directory);
  }

  assertFragmentRequires(entries, manifests);
  const capabilities = resolveFragmentCapabilities(plan.type, manifests);

  const packageData = mergePackageFragments(
    manifests.map((manifest) => ({
      id: manifest.id,
      package: manifest.package
    }))
  );
  const metadata = getDatabaseMetadata(plan.database);
  const tokens: TemplateTokens = {
    name: plan.packageName,
    type: plan.type,
    database: plan.database,
    adapter: metadata.adapter,
    driver: metadata.driver
  };

  const files = new Map<string, ResolvedFile>();
  const warnings: string[] = [];
  // Files are processed in base -> type -> database order so the first
  // fragment owns a duplicated path.
  for (let index = 0; index < manifests.length; index += 1) {
    const manifest = manifests[index];
    const directory = fragmentDirectories[index];
    if (!manifest || !directory) continue;
    for (const relative of manifest.files ?? []) {
      await addFragmentFile({
        files,
        warnings,
        manifest,
        fragmentDir: directory,
        relative,
        binary: false,
        tokens
      });
    }
    for (const relative of manifest.assets ?? []) {
      await addFragmentFile({
        files,
        warnings,
        manifest,
        fragmentDir: directory,
        relative,
        binary: true,
        tokens
      });
    }
  }

  const env = mergeEnvironment({
    entries: manifests.flatMap((manifest) =>
      (manifest.env ?? []).map((line) => ({
        line,
        owner: `fragment "${manifest.id}"`
      }))
    ),
    files,
    tokens,
    fallbackFragmentId: manifests[0]?.id ?? 'base'
  });
  const packageJson = renderPackageJson(plan, packageData, tokens);
  const plugins = Array.isArray(packageJson.plugins)
    ? packageJson.plugins.filter(
        (plugin): plugin is string => typeof plugin === 'string'
      )
    : [];
  const sortedFiles = [...files.values()]
    .filter((file) => !(plan.noAgentsMd && file.path === 'AGENTS.md'))
    .sort((left, right) => compareStrings(left.path, right.path));

  const project: ResolvedProject = {
    plan,
    files: sortedFiles,
    packageJson,
    capabilities,
    env,
    plugins,
    warnings
  };

  validateResolvedProject(project);
  return project;
}
