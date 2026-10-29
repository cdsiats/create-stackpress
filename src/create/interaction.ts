import { CliError } from '../errors.js';
import { detectPackageManager } from '../package-manager/detect.js';
import {
  DATABASES,
  PACKAGE_MANAGERS,
  PROJECT_TYPES,
  type CreateOptions,
  type DatabaseId,
  type PackageManager,
  type ProjectType
} from '../types.js';
import {
  createPrompts,
  type PromptAdapter,
  type SelectPromptOptions
} from './prompts.js';

export type InteractionStreams = {
  stdin: { isTTY?: boolean };
  stdout: { isTTY?: boolean };
};

export type InteractionContext = {
  env?: NodeJS.ProcessEnv;
  streams?: InteractionStreams;
  prompts?: PromptAdapter;
  detectPackageManager?: () => PackageManager;
};

export type InteractionMode = 'interactive' | 'yes' | 'non-interactive';

export type ResolvedCreateOptions = {
  directory: string;
  type: ProjectType;
  database: DatabaseId;
  packageManager: PackageManager;
  install: boolean;
  git: boolean;
  template?: string;
  databaseUrl?: string;
  overwrite: boolean;
  dryRun: boolean;
  noColor: boolean;
  noAgentsMd: boolean;
};

const TYPE_LABELS: Record<ProjectType, string> = {
  'full-stack': 'Full-stack',
  'api-only': 'API-only',
  'minimal': 'Minimal/blank',
  'admin-only': 'Admin-only'
};

const DATABASE_LABELS: Record<DatabaseId, string> = {
  pglite: 'PGlite (local default)',
  postgres: 'PostgreSQL',
  cockroachdb: 'CockroachDB (production)',
  mysql: 'MySQL',
  sqlite: 'SQLite'
};

const PACKAGE_MANAGER_LABELS: Record<PackageManager, string> = {
  npm: 'npm',
  pnpm: 'pnpm',
  yarn: 'yarn',
  bun: 'bun'
};

export function isCi(env: NodeJS.ProcessEnv): boolean {
  const value = env.CI;
  if (!value) return false;
  const normalized = value.toLowerCase();
  return normalized !== '0' && normalized !== 'false';
}

export function isAgentEnvironment(env: NodeJS.ProcessEnv): boolean {
  return [
    'CLAUDECODE',
    'OPENCODE',
    'CURSOR_TRACE_ID',
    'GEMINI_CLI',
    'CODEX_SANDBOX'
  ].some((key) => Boolean(env[key]));
}

export function getInteractionMode(
  options: CreateOptions,
  context: InteractionContext = {}
): InteractionMode {
  if (options.yes) return 'yes';
  if (options.noInput) return 'non-interactive';

  const env = context.env ?? process.env;
  if (isCi(env) || isAgentEnvironment(env)) return 'non-interactive';

  const streams = context.streams ?? {
    stdin: process.stdin,
    stdout: process.stdout
  };
  if (!streams.stdin.isTTY || !streams.stdout.isTTY) return 'non-interactive';

  return 'interactive';
}

export function formatPlanSummary(options: ResolvedCreateOptions): string {
  return [
    `Target: ${options.directory}`,
    `Type: ${TYPE_LABELS[options.type]}`,
    `Database: ${DATABASE_LABELS[options.database]}`,
    `Package manager: ${options.packageManager}`,
    `Install: ${options.install ? 'yes' : 'no'}`,
    `Git: ${options.git ? 'yes' : 'no'}`,
    options.template ? `Template: ${options.template}` : 'Template: core preset',
    options.dryRun ? 'Mode: dry run' : 'Mode: create'
  ].join('\n');
}

async function ask<T extends string>(
  prompts: PromptAdapter,
  options: SelectPromptOptions<T>
): Promise<T> {
  const answer = await prompts.select<T>(options);
  if (prompts.isCancel(answer)) {
    prompts.cancel('Cancelled.');
    throw CliError.interrupted();
  }
  return answer as T;
}

async function askConfirm(
  prompts: PromptAdapter,
  message: string,
  initialValue: boolean
): Promise<boolean> {
  const answer = await prompts.confirm({ message, initialValue });
  if (prompts.isCancel(answer)) {
    prompts.cancel('Cancelled.');
    throw CliError.interrupted();
  }
  return answer as boolean;
}

export async function resolveCreateOptions(
  options: CreateOptions,
  context: InteractionContext = {}
): Promise<ResolvedCreateOptions | null> {
  const mode = getInteractionMode(options, context);
  const prompts = context.prompts ?? createPrompts();
  const env = context.env ?? process.env;
  const detect = context.detectPackageManager ?? (() => detectPackageManager({
    userAgent: env.npm_config_user_agent
  }));

  let directory = options.directory?.trim();

  if (!directory) {
    if (mode !== 'interactive') {
      throw CliError.usage(
        'Missing target directory.',
        'Pass a directory, for example: create-stackpress my-app'
      );
    }

    const answer = await prompts.text({
      message: 'Where should the project be created?',
      placeholder: 'my-app',
      validate: (value) => (
        value?.trim() ? undefined : 'Enter a directory.'
      )
    });

    if (prompts.isCancel(answer)) {
      prompts.cancel('Cancelled.');
      throw CliError.interrupted();
    }

    directory = String(answer).trim();
  }

  let type = options.type;
  let database = options.database;
  let packageManager = options.packageManager;
  let install = options.install;
  let git = options.git;

  if (mode === 'interactive') {
    if (!type && !options.template) {
      type = await ask<ProjectType>(prompts, {
        message: 'Project type',
        initialValue: 'full-stack',
        options: PROJECT_TYPES.map((value) => ({
          value,
          label: TYPE_LABELS[value],
          hint: value
        }))
      });
    }

    if (!database && !options.template) {
      database = await ask<DatabaseId>(prompts, {
        message: 'Database',
        initialValue: 'pglite',
        options: DATABASES.map((value) => ({
          value,
          label: DATABASE_LABELS[value],
          hint: value
        }))
      });
    }

    if (!packageManager) {
      const detected = detect();
      packageManager = await ask<PackageManager>(prompts, {
        message: 'Package manager',
        initialValue: detected,
        options: PACKAGE_MANAGERS.map((value) => ({
          value,
          label: PACKAGE_MANAGER_LABELS[value],
          hint: value === detected ? 'detected' : undefined
        }))
      });
    }

    if (install === undefined) {
      install = await askConfirm(prompts, 'Install dependencies?', true);
    }

    if (git === undefined) {
      git = await askConfirm(prompts, 'Initialize git?', true);
    }
  }

  const resolved: ResolvedCreateOptions = {
    directory: directory as string,
    type: type ?? 'full-stack',
    database: database ?? 'pglite',
    packageManager: packageManager ?? detect(),
    install: install ?? mode === 'yes',
    git: git ?? mode === 'yes',
    template: options.template,
    databaseUrl: options.databaseUrl,
    overwrite: options.overwrite ?? false,
    dryRun: options.dryRun ?? false,
    noColor: options.noColor ?? false,
    noAgentsMd: options.noAgentsMd ?? false
  };

  if (mode === 'interactive') {
    prompts.note(formatPlanSummary(resolved), 'Create project');
    const confirmed = await askConfirm(prompts, 'Create this project?', true);
    if (!confirmed) return null;
  }

  return resolved;
}
