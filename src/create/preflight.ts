import { spawnSync } from 'node:child_process';
import { promises as fsp } from 'node:fs';
import { CliError, errorMessage } from '../errors.js';
import { getInstallCommand } from '../package-manager/commands.js';
import {
  assertStaticTemplatePlan,
  assertTemplateCompatibility,
  prepareTemplateSource,
  type PreparedTemplate
} from '../template/source.js';
import type { CreatePlan } from '../types.js';

const IGNORED_TARGET_ENTRIES = new Set(['.DS_Store']);
const PACKAGE_NAME_PATTERN =
  /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/;
const RESERVED_PACKAGE_NAMES = new Set(['node_modules', 'favicon.ico']);

export type CommandExists = (command: string) => boolean | Promise<boolean>;

export type PreflightContext = {
  nodeVersion?: string;
  commandExists?: CommandExists;
  cwd?: string;
  explicitType?: boolean;
  explicitDatabase?: boolean;
  prepareTemplate?: typeof prepareTemplateSource;
};

export type PreflightResult = {
  warnings: string[];
  targetExists: boolean;
  targetEmpty: boolean;
  packageManagerAvailable: boolean;
  gitAvailable: boolean;
  preparedTemplate?: PreparedTemplate;
};

export type Preflight = (
  plan: CreatePlan,
  context?: PreflightContext
) => Promise<PreflightResult>;

export function validatePackageName(name: string): string | undefined {
  if (name.length === 0) {
    return 'The package name is empty.';
  }
  if (name.length > 214) {
    return 'The package name must be 214 characters or fewer.';
  }
  if (name !== name.trim()) {
    return 'The package name must not have leading or trailing whitespace.';
  }
  if (name !== name.toLowerCase()) {
    return 'The package name must be lowercase.';
  }
  if (name.startsWith('.') || name.startsWith('_')) {
    return 'The package name must not start with "." or "_".';
  }
  if (RESERVED_PACKAGE_NAMES.has(name)) {
    return `"${name}" is reserved by npm.`;
  }
  if (!PACKAGE_NAME_PATTERN.test(name)) {
    return 'The package name may only contain lowercase letters, digits, ".", "_", "~", "-", "@", and "/".';
  }
  return undefined;
}

function assertNodeVersion(nodeVersion: string | undefined): void {
  const version = nodeVersion ?? process.versions.node;
  const major = Number.parseInt(version.replace(/^v/, '').split('.')[0] ?? '', 10);
  if (!Number.isFinite(major) || major < 22) {
    throw CliError.preflight(
      `Node.js 22 or newer is required. Found ${version}.`,
      'Upgrade Node.js and re-run create-stackpress.'
    );
  }
}

function assertPackageName(plan: CreatePlan): void {
  const problem = validatePackageName(plan.packageName);
  if (!problem) return;
  throw CliError.preflight(
    `Invalid npm package name "${plan.packageName}": ${problem}`,
    'The package name is derived from the target directory name. Rename the directory to a valid npm package name or choose a different target.'
  );
}

async function prepareTemplate(
  plan: CreatePlan,
  context: PreflightContext
): Promise<PreparedTemplate | undefined> {
  if (plan.template === undefined) return undefined;

  const prepare = context.prepareTemplate ?? prepareTemplateSource;
  const prepared = await prepare(plan, { cwd: context.cwd });
  try {
    if (prepared.kind === 'manifest') {
      if (!prepared.manifest) {
        throw CliError.generation(
          `Template "${prepared.source.display}" is missing its parsed create-stackpress.json.`
        );
      }
      assertTemplateCompatibility(plan, prepared.manifest);
    } else {
      assertStaticTemplatePlan(
        plan,
        context.explicitType ?? false,
        context.explicitDatabase ?? false
      );
    }
    return prepared;
  } catch (error) {
    await prepared.cleanup().catch(() => undefined);
    throw error;
  }
}

async function inspectTarget(
  plan: CreatePlan
): Promise<{ targetExists: boolean; targetEmpty: boolean }> {
  let stats;
  try {
    stats = await fsp.lstat(plan.targetDir);
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      return { targetExists: false, targetEmpty: true };
    }
    throw CliError.preflight(
      `Cannot inspect target directory: ${plan.targetDir}`,
      errorMessage(error)
    );
  }

  if (stats.isSymbolicLink()) {
    throw CliError.preflight(
      `Target is a symbolic link: ${plan.targetDir}`,
      'Choose a real directory instead of a symlink.'
    );
  }

  if (!stats.isDirectory()) {
    throw CliError.preflight(
      `Target is not a directory: ${plan.targetDir}`,
      'Choose a directory path or remove the existing file.'
    );
  }

  let entries: string[];
  try {
    entries = await fsp.readdir(plan.targetDir);
  } catch (error) {
    throw CliError.preflight(
      `Cannot read target directory: ${plan.targetDir}`,
      errorMessage(error)
    );
  }

  const targetEmpty = entries.every((entry) => IGNORED_TARGET_ENTRIES.has(entry));
  if (!targetEmpty && !plan.overwrite) {
    throw CliError.preflight(
      `Target directory is not empty: ${plan.targetDir}`,
      'Choose an empty directory or pass --overwrite to replace conflicting files.'
    );
  }

  return { targetExists: true, targetEmpty };
}

export function defaultCommandExists(command: string): boolean {
  const finder = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(finder, [command], {
    stdio: 'ignore',
    shell: false
  });
  return result.status === 0;
}

async function assertPackageManager(
  plan: CreatePlan,
  commandExists: CommandExists
): Promise<boolean> {
  if (!plan.install) return true;
  if (await commandExists(plan.packageManager)) return true;

  const installCommand = getInstallCommand(plan.packageManager).display;
  throw CliError.preflight(
    `Package manager "${plan.packageManager}" is not available. The install step would run "${installCommand}".`,
    `Install ${plan.packageManager} and re-run, or pass --no-install to scaffold without installing dependencies.`
  );
}

async function checkGit(
  plan: CreatePlan,
  commandExists: CommandExists,
  warnings: string[]
): Promise<boolean> {
  if (!plan.git) return false;
  if (await commandExists('git')) return true;

  warnings.push(
    'git was not found. Skipping git initialization; run git init, git add ., and git commit -m "Initial commit" manually after scaffolding.'
  );
  return false;
}

/**
 * Runs every pre-write check. It never writes to the target.
 */
export async function preflightPlan(
  plan: CreatePlan,
  context: PreflightContext = {}
): Promise<PreflightResult> {
  const commandExists = context.commandExists ?? defaultCommandExists;
  const warnings: string[] = [];

  assertNodeVersion(context.nodeVersion);
  assertPackageName(plan);

  const target = await inspectTarget(plan);
  const packageManagerAvailable = await assertPackageManager(plan, commandExists);
  const gitAvailable = await checkGit(plan, commandExists, warnings);
  const preparedTemplate = await prepareTemplate(plan, context);

  return {
    warnings,
    targetExists: target.targetExists,
    targetEmpty: target.targetEmpty,
    packageManagerAvailable,
    gitAvailable,
    ...(preparedTemplate === undefined ? {} : { preparedTemplate })
  };
}
