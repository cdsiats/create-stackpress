import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { CliError, errorMessage } from '../errors.js';
import { createOutput, type Output } from '../output.js';
import { getInstallCommand } from '../package-manager/commands.js';
import { getDatabaseMetadata } from '../template/manifest.js';
import { resolveProject, type ResolveProjectInput } from '../template/resolve.js';
import {
  prepareTemplateSource,
  resolveTemplateProject,
  type PreparedTemplate
} from '../template/source.js';
import type {
  ResolvedProject,
  WriteOptions,
  WriteResult
} from '../template/types.js';
import { validateResolvedProject } from '../template/validate.js';
import { writeProject, type WriteContext } from '../template/write.js';
import type {
  CreatePlan,
  CreateResult,
  DatabaseId,
  PackageManager,
  ProjectType
} from '../types.js';
import {
  CLI_VERSION,
  STACKPRESS_VERSION,
  TEMPLATE_VERSION
} from '../version.js';
import { applyPackageManagerDocuments } from './documents.js';
import {
  buildNextSteps,
  describeDatabasePrerequisite,
  findExpectedDatabaseUrl
} from './next-steps.js';
import {
  inferPackageManagerSource
} from './plan.js';
import {
  preflightPlan,
  type CommandExists,
  type Preflight,
  type PreflightResult
} from './preflight.js';

const TYPE_LABELS: Record<ProjectType, string> = {
  'full-stack': 'Full-stack',
  'api-only': 'API-only',
  minimal: 'Minimal',
  'admin-only': 'Admin-only'
};

const DATABASE_LABELS: Record<DatabaseId, string> = {
  pglite: 'PGlite',
  postgres: 'PostgreSQL',
  cockroachdb: 'CockroachDB',
  mysql: 'MySQL',
  sqlite: 'SQLite'
};

const PACKAGE_MANAGER_LABELS: Record<PackageManager, string> = {
  npm: 'npm',
  pnpm: 'pnpm',
  yarn: 'yarn',
  bun: 'bun'
};

export type InstallContext = {
  plan: CreatePlan;
  project: ResolvedProject;
  targetDir: string;
  output: Output;
};

export type InstallOutcome = {
  installed?: boolean;
  warnings?: string[];
};

export type InstallImplementation = (
  context: InstallContext
) => Promise<InstallOutcome | void>;

export type GitContext = InstallContext;

export type GitOutcome = {
  initialized?: boolean;
  warnings?: string[];
};

export type GitImplementation = (
  context: GitContext
) => Promise<GitOutcome | void>;

/**
 * Injection seams for the create workflow. The resolver, preflight, and writer
 * default to the real implementations. The production CLI always injects the
 * install and git implementations; omitting either exercises the guard used by
 * tests that simulate a workflow without those steps.
 */
export type CreateWorkflowDependencies = {
  preflight?: Preflight;
  resolveProject?: (input: ResolveProjectInput) => Promise<ResolvedProject>;
  writeProject?: (
    project: ResolvedProject,
    options: WriteOptions,
    context?: WriteContext
  ) => Promise<WriteResult>;
  install?: InstallImplementation;
  git?: GitImplementation;
  prepareTemplateSource?: typeof prepareTemplateSource;
  resolveTemplateProject?: typeof resolveTemplateProject;
};

export type RunCreateOptions = {
  plan: CreatePlan;
  databaseUrl?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  output?: Output;
  nodeVersion?: string;
  commandExists?: CommandExists;
  packageManagerSource?: string;
  explicitType?: boolean;
  explicitDatabase?: boolean;
  preparedTemplate?: PreparedTemplate;
  dependencies?: CreateWorkflowDependencies;
};

function uniqueWarnings(values: string[]): string[] {
  return [...new Set(values)];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertDatabaseUrlValue(value: string | undefined): void {
  if (value === undefined) return;
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    throw CliError.usage(
      '--db-url must be a single line without control characters.',
      'Pass the database URL as one argument.'
    );
  }
}

function withDatabaseUrl(
  project: ResolvedProject,
  databaseUrl: string | undefined
): ResolvedProject {
  if (databaseUrl === undefined) return project;
  const files = [
    ...project.files,
    {
      path: '.env',
      contents: `DATABASE_URL=${databaseUrl}\n`,
      binary: false,
      fragmentId: 'create-stackpress'
    }
  ].sort((left, right) => {
    if (left.path < right.path) return -1;
    if (left.path > right.path) return 1;
    return 0;
  });
  return { ...project, files };
}

function projectFileList(project: ResolvedProject): string[] {
  return [...project.files.map((file) => file.path), 'package.json'].sort();
}

function capabilityText(capabilities: string[]): string {
  return capabilities.length === 0 ? '(none)' : capabilities.join(', ');
}

function overwriteNotice(
  plan: CreatePlan,
  preflight: PreflightResult
): string {
  if (!plan.overwrite) return 'no';
  if (preflight.targetExists && !preflight.targetEmpty) {
    return 'yes (conflicting files are backed up before replacement)';
  }
  return 'yes (no existing files to back up)';
}

function templateLabel(template: PreparedTemplate | undefined): string {
  if (!template) return `core preset (template ${TEMPLATE_VERSION})`;
  const kind =
    template.kind === 'static'
      ? 'static copy; type/database not verified'
      : 'manifest template';
  const version = template.manifest?.version;
  return `${template.source.display} (${kind}${version ? ` ${version}` : ''})`;
}

function printPlanReview(options: {
  output: Output;
  plan: CreatePlan;
  project: ResolvedProject;
  preflight: PreflightResult;
  packageManagerSource: string;
  template?: PreparedTemplate;
}): void {
  const {
    output,
    plan,
    project,
    preflight,
    packageManagerSource,
    template
  } = options;
  const metadata = getDatabaseMetadata(plan.database);
  const fileCount = project.files.length + 1;

  output.heading(`create-stackpress ${CLI_VERSION}`);
  output.line();
  output.heading('Plan');
  output.step(`Target: ${plan.targetDir}`);
  output.step(`Package name: ${plan.packageName}`);
  output.step(
    `Project type: ${TYPE_LABELS[plan.type]} (${capabilityText(project.capabilities)})`
  );
  output.step(
    `Database: ${DATABASE_LABELS[plan.database]} (adapter ${metadata.adapter} ${metadata.adapterVersion}, driver ${metadata.driver} ${metadata.driverVersion})`
  );
  output.step(
    `Package manager: ${PACKAGE_MANAGER_LABELS[plan.packageManager]} (${packageManagerSource})`
  );
  output.step(`Install: ${plan.install ? 'yes' : 'no'}`);
  output.step(`Git: ${plan.git ? 'yes' : 'no'}`);
  output.step(`Template: ${templateLabel(template)}`);
  output.step(`Files: ${fileCount}`);
  output.step(`Overwrite: ${overwriteNotice(plan, preflight)}`);
  if (plan.dryRun) {
    output.step('Mode: dry run (no files will be written)');
  }
}

function printFileList(output: Output, files: string[]): void {
  output.line();
  output.heading(`Files (${files.length}):`);
  for (const file of files) {
    output.line(`  ${file}`);
  }
}

function printWarnings(output: Output, warnings: string[]): void {
  for (const warning of warnings) {
    output.warn(warning);
  }
}

function printSuccess(options: {
  output: Output;
  plan: CreatePlan;
  project: ResolvedProject;
  template?: PreparedTemplate;
}): void {
  const { output, plan, project, template } = options;
  const metadata = getDatabaseMetadata(plan.database);

  output.line();
  output.success(`Created ${plan.targetDir}`);
  output.step(
    `Preset: ${TYPE_LABELS[plan.type]} (${capabilityText(project.capabilities)})`
  );
  output.step(
    `Database: ${DATABASE_LABELS[plan.database]} (${metadata.adapter}, ${metadata.driver})`
  );
  if (template) {
    output.step(`Template: ${templateLabel(template)}`);
  } else {
    output.step(
      `Pinned versions: stackpress ${STACKPRESS_VERSION}, ${metadata.adapter} ${metadata.adapterVersion}, ${metadata.driver} ${metadata.driverVersion}`
    );
    output.step(`Template: ${TEMPLATE_VERSION}`);
  }
  output.step(`Package manager: ${PACKAGE_MANAGER_LABELS[plan.packageManager]}`);
}

function printNextSteps(options: {
  output: Output;
  plan: CreatePlan;
  project: ResolvedProject;
  steps: string[];
  template?: PreparedTemplate;
}): void {
  const { output, plan, project, steps, template } = options;
  const expectedUrl = findExpectedDatabaseUrl(project.env);

  output.line();
  output.heading('Next steps:');
  for (const step of steps) {
    output.step(step);
  }
  output.line();
  if (template) {
    output.info('Custom template: follow its README for database and environment setup.');
  } else {
    output.info(describeDatabasePrerequisite(plan.database, expectedUrl));
  }
}

function createStagedValidator(project: ResolvedProject) {
  const expected = projectFileList(project);

  return async (stagingDir: string): Promise<void> => {
    const packagePath = path.join(stagingDir, 'package.json');
    let parsed: unknown;
    try {
      parsed = JSON.parse(await fsp.readFile(packagePath, 'utf8'));
    } catch (error) {
      throw CliError.generation(
        `Staged package.json is not valid JSON: ${errorMessage(error)}`
      );
    }
    if (!isPlainObject(parsed) || parsed.name !== project.plan.packageName) {
      throw CliError.generation(
        `Staged package.json does not use the planned package name "${project.plan.packageName}".`
      );
    }

    for (const relative of expected) {
      const destination = path.join(stagingDir, ...relative.split('/'));
      let stats;
      try {
        stats = await fsp.lstat(destination);
      } catch {
        throw CliError.generation(
          `Staged project is missing expected file: ${relative}`
        );
      }
      if (!stats.isFile() || stats.isSymbolicLink()) {
        throw CliError.generation(
          `Staged project entry is not a regular file: ${relative}`
        );
      }
    }
  };
}

/**
 * Runs preflight, resolution, optional dry-run review, staging/validation/
 * commit, the injectable install/git hooks, and all human output.
 */
export async function runCreate(
  options: RunCreateOptions
): Promise<CreateResult> {
  const { plan } = options;
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const env = options.env ?? process.env;
  const output = options.output ?? createOutput({ noColor: true });
  const dependencies = options.dependencies ?? {};
  const packageManagerSource =
    options.packageManagerSource ??
    inferPackageManagerSource(plan.packageManager, env);

  assertDatabaseUrlValue(options.databaseUrl);
  if (plan.template !== undefined && options.databaseUrl !== undefined) {
    throw CliError.usage(
      '--db-url is not supported with --template.',
      'Add DATABASE_URL to the template .env.sample or .env file instead.'
    );
  }
  if (plan.install && !dependencies.install) {
    throw CliError.install(
      `No install implementation was provided for this workflow run (${plan.packageManager}).`,
      'Re-run with --no-install to scaffold without installing dependencies.'
    );
  }

  const preflight = dependencies.preflight ?? preflightPlan;
  const preflightResult = await preflight(plan, {
    nodeVersion: options.nodeVersion,
    commandExists: options.commandExists,
    cwd,
    explicitType: options.explicitType,
    explicitDatabase: options.explicitDatabase
  });

  let warnings = [...preflightResult.warnings];
  if (plan.git && preflightResult.gitAvailable && !dependencies.git) {
    warnings.push(
      'No git implementation was provided for this workflow run; skipping it. Run git init manually after scaffolding.'
    );
  }

  let prepared = options.preparedTemplate ?? preflightResult.preparedTemplate;
  let ownsPrepared = prepared !== undefined;
  try {
    if (!prepared && plan.template !== undefined) {
      const prepare =
        dependencies.prepareTemplateSource ?? prepareTemplateSource;
      prepared = await prepare(plan, { cwd });
      ownsPrepared = true;
    }

    const resolved = prepared
      ? await (dependencies.resolveTemplateProject ?? resolveTemplateProject)(
          prepared,
          plan
        )
      : await (dependencies.resolveProject ?? resolveProject)({ plan });
    const project = applyPackageManagerDocuments(
      withDatabaseUrl(resolved, options.databaseUrl)
    );
    validateResolvedProject(project);

    printPlanReview({
      output,
      plan,
      project,
      preflight: preflightResult,
      packageManagerSource,
      template: prepared
    });

    if (plan.dryRun) {
      warnings = uniqueWarnings([...warnings, ...project.warnings]);
      printFileList(output, projectFileList(project));
      printWarnings(output, warnings);
      return {
        plan,
        installed: false,
        gitInitialized: false,
        warnings,
        nextSteps: []
      };
    }

    const write = dependencies.writeProject ?? writeProject;
    const writeResult = await write(
      project,
      {
        targetDir: plan.targetDir,
        overwrite: plan.overwrite,
        validate: createStagedValidator(project)
      },
      { cwd }
    );
    warnings.push(...writeResult.warnings);

    let installed = false;
    if (plan.install && dependencies.install) {
      try {
        const outcome = (await dependencies.install({
          plan,
          project,
          targetDir: plan.targetDir,
          output
        })) ?? {};
        installed = outcome.installed ?? true;
        warnings.push(...(outcome.warnings ?? []));
      } catch (error) {
        if (error instanceof CliError && error.code === 'INTERRUPTED') throw error;
        if (error instanceof CliError && error.code === 'INSTALL') throw error;
        const installCommand = getInstallCommand(plan.packageManager).display;
        const hint = error instanceof CliError && error.hint
          ? error.hint
          : `The project was created at ${plan.targetDir}. Retry with "${installCommand}".`;
        throw CliError.install(
          `Dependency installation failed: ${errorMessage(error)}`,
          hint
        );
      }
    }

    let gitInitialized = false;
    if (plan.git && preflightResult.gitAvailable && dependencies.git) {
      try {
        const outcome = (await dependencies.git({
          plan,
          project,
          targetDir: plan.targetDir,
          output
        })) ?? {};
        gitInitialized = outcome.initialized ?? true;
        warnings.push(...(outcome.warnings ?? []));
      } catch (error) {
        if (error instanceof CliError && error.code === 'INTERRUPTED') throw error;
        warnings.push(
          `Git initialization failed: ${errorMessage(error)}. The project was created; run git init, git add ., and git commit -m "Initial commit" manually.`
        );
      }
    }

    warnings = uniqueWarnings(warnings);
    const scripts = isPlainObject(project.packageJson.scripts)
      ? Object.keys(project.packageJson.scripts)
      : [];
    const nextSteps = buildNextSteps(plan, {
      installed,
      gitInitialized,
      customTemplate: plan.template !== undefined,
      scripts
    });

    printWarnings(output, warnings);
    printSuccess({ output, plan, project, template: prepared });
    printNextSteps({
      output,
      plan,
      project,
      steps: nextSteps,
      template: prepared
    });

    return {
      plan,
      installed,
      gitInitialized,
      warnings,
      nextSteps
    };
  } finally {
    if (ownsPrepared && prepared) {
      await prepared.cleanup().catch(() => undefined);
    }
  }
}
