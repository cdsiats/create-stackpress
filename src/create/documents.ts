import type { PackageManager } from '../types.js';
import type { ResolvedProject } from '../template/types.js';

const DOCUMENT_PATHS = new Set(['README.md', 'AGENTS.md']);

/**
 * Rewrites the npm commands in generated documentation for the selected
 * package manager. Other prose is left untouched.
 */
export function rewritePackageManagerCommands(
  contents: string,
  packageManager: PackageManager
): string {
  if (packageManager === 'npm') return contents;
  return contents
    .replace(/\bnpm install\b/g, `${packageManager} install`)
    .replace(/\bnpm run ([A-Za-z0-9:_-]+)/g, `${packageManager} run $1`);
}

export function applyPackageManagerDocuments(
  project: ResolvedProject
): ResolvedProject {
  if (project.plan.packageManager === 'npm') return project;

  let changed = false;
  const files = project.files.map((file) => {
    if (
      !DOCUMENT_PATHS.has(file.path) ||
      file.binary ||
      typeof file.contents !== 'string'
    ) {
      return file;
    }
    const contents = rewritePackageManagerCommands(
      file.contents,
      project.plan.packageManager
    );
    if (contents === file.contents) return file;
    changed = true;
    return { ...file, contents };
  });

  return changed ? { ...project, files } : project;
}
