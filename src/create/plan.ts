import path from 'node:path';
import type { CreatePlan, PackageManager } from '../types.js';
import type { ResolvedCreateOptions } from './interaction.js';

export type CreatePlanContext = {
  cwd?: string;
};

/**
 * Resolves the target directory to an absolute path. The package name is
 * derived from the resolved directory name, so a `.` target uses the name of
 * the current directory.
 */
export function resolveTargetDir(
  directory: string,
  cwd: string = process.cwd()
): string {
  return path.resolve(cwd, directory);
}

export function derivePackageName(targetDir: string): string {
  return path.basename(path.resolve(targetDir));
}

export function buildCreatePlan(
  options: ResolvedCreateOptions,
  context: CreatePlanContext = {}
): CreatePlan {
  const targetDir = resolveTargetDir(options.directory, context.cwd);
  const plan: CreatePlan = {
    targetDir,
    packageName: derivePackageName(targetDir),
    type: options.type,
    database: options.database,
    packageManager: options.packageManager,
    install: options.install,
    git: options.git,
    overwrite: options.overwrite,
    dryRun: options.dryRun,
    noAgentsMd: options.noAgentsMd
  };
  if (options.template !== undefined) {
    plan.template = options.template;
  }
  return plan;
}

/**
 * Describes where the selected package manager came from without re-running
 * detection. The CLI passes an explicit source when `--pm` was used.
 */
export function inferPackageManagerSource(
  packageManager: PackageManager,
  env: NodeJS.ProcessEnv = process.env
): string {
  const userAgent = env.npm_config_user_agent;
  if (userAgent && userAgent.startsWith(`${packageManager}/`)) {
    return 'detected from npm_config_user_agent';
  }
  return packageManager === 'npm' ? 'npm fallback' : 'selected';
}
