import { parseArgs } from 'node:util';
import { CliError, errorMessage } from './errors.js';
import {
  DATABASES,
  PACKAGE_MANAGERS,
  PROJECT_TYPES,
  isDatabaseId,
  isPackageManager,
  isProjectType,
  type CreateOptions,
  type DatabaseId,
  type PackageManager,
  type ProjectType
} from './types.js';
import {
  CLI_VERSION,
  STACKPRESS_VERSION,
  TEMPLATE_VERSION
} from './version.js';

const TYPE_ALIASES: Record<string, ProjectType> = {
  'full-stack': 'full-stack',
  fullstack: 'full-stack',
  'api-only': 'api-only',
  api: 'api-only',
  minimal: 'minimal',
  blank: 'minimal',
  'admin-only': 'admin-only',
  admin: 'admin-only'
};

const DATABASE_ALIASES: Record<string, DatabaseId> = {
  pglite: 'pglite',
  postgres: 'postgres',
  postgresql: 'postgres',
  pg: 'postgres',
  cockroachdb: 'cockroachdb',
  cockroach: 'cockroachdb',
  crdb: 'cockroachdb',
  mysql: 'mysql',
  sqlite: 'sqlite'
};

export function normalizeProjectType(value: string): ProjectType {
  const normalized = TYPE_ALIASES[value.toLowerCase()];
  if (!normalized || !isProjectType(normalized)) {
    throw CliError.usage(
      `Invalid project type: ${value}`,
      `Use one of: ${PROJECT_TYPES.join(', ')}.`
    );
  }
  return normalized;
}

export function normalizeDatabase(value: string): DatabaseId {
  const normalized = DATABASE_ALIASES[value.toLowerCase()];
  if (!normalized || !isDatabaseId(normalized)) {
    throw CliError.usage(
      `Invalid database: ${value}`,
      `Use one of: ${DATABASES.join(', ')}.`
    );
  }
  return normalized;
}

export function normalizePackageManager(value: string): PackageManager {
  const normalized = value.toLowerCase();
  if (!isPackageManager(normalized)) {
    throw CliError.usage(
      `Invalid package manager: ${value}`,
      `Use one of: ${PACKAGE_MANAGERS.join(', ')}.`
    );
  }
  return normalized;
}

export function parseCliArgs(args: string[]): CreateOptions {
  let parsed;

  try {
    parsed = parseArgs({
      args,
      allowPositionals: true,
      strict: true,
      options: {
        type: { type: 'string' },
        db: { type: 'string' },
        pm: { type: 'string' },
        install: { type: 'boolean' },
        'no-install': { type: 'boolean' },
        git: { type: 'boolean' },
        'no-git': { type: 'boolean' },
        template: { type: 'string' },
        'db-url': { type: 'string' },
        overwrite: { type: 'boolean' },
        'dry-run': { type: 'boolean' },
        yes: { type: 'boolean', short: 'y' },
        'no-input': { type: 'boolean' },
        'no-color': { type: 'boolean' },
        'no-agents-md': { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' }
      }
    });
  } catch (error) {
    throw CliError.usage(
      errorMessage(error),
      'Run create-stackpress --help for usage.'
    );
  }

  if (parsed.positionals.length > 1) {
    throw CliError.usage(
      'Only one target directory is allowed.',
      'Pass a project directory, for example: create-stackpress my-app'
    );
  }

  if (parsed.values.help) return { help: true };
  if (parsed.values.version) return { version: true };

  if (parsed.values.install && parsed.values['no-install']) {
    throw CliError.usage('Cannot use --install and --no-install together.');
  }
  if (parsed.values.git && parsed.values['no-git']) {
    throw CliError.usage('Cannot use --git and --no-git together.');
  }

  const options: CreateOptions = {
    directory: parsed.positionals[0]
  };

  if (parsed.values.type !== undefined) {
    options.type = normalizeProjectType(parsed.values.type);
  }
  if (parsed.values.db !== undefined) {
    options.database = normalizeDatabase(parsed.values.db);
  }
  if (parsed.values.pm !== undefined) {
    options.packageManager = normalizePackageManager(parsed.values.pm);
  }
  if (parsed.values.install) options.install = true;
  if (parsed.values['no-install']) options.install = false;
  if (parsed.values.git) options.git = true;
  if (parsed.values['no-git']) options.git = false;
  if (parsed.values.template !== undefined) options.template = parsed.values.template;
  if (parsed.values['db-url'] !== undefined) options.databaseUrl = parsed.values['db-url'];
  if (parsed.values.overwrite) options.overwrite = true;
  if (parsed.values['dry-run']) options.dryRun = true;
  if (parsed.values.yes) options.yes = true;
  if (parsed.values['no-input']) options.noInput = true;
  if (parsed.values['no-color']) options.noColor = true;
  if (parsed.values['no-agents-md']) options.noAgentsMd = true;

  return options;
}

export function helpText(): string {
  return `create-stackpress ${CLI_VERSION}

Usage:
  create-stackpress [directory] [options]

Options:
  --type <type>          full-stack | api-only | minimal | admin-only
  --db <database>        pglite | postgres | cockroachdb | mysql | sqlite
  --pm <manager>         npm | pnpm | yarn | bun
  --install              install dependencies after scaffolding
  --no-install           skip dependency installation
  --git                  initialize a git repository
  --no-git               skip git initialization
  --template <source>    local path, owner/repo, or GitHub URL
  --db-url <url>         write the database URL to .env
  --overwrite            allow writing into a non-empty target
  --dry-run              print the plan and file set without writing
  --yes, -y              accept defaults; requires a directory
  --no-input             force non-interactive mode
  --no-color             disable ANSI color
  --no-agents-md         omit AGENTS.md
  --help, -h             show this help
  --version, -v          show CLI, template, and Stackpress versions

Examples:
  create-stackpress my-app
  create-stackpress my-app --type api-only --db cockroachdb --pm pnpm
  create-stackpress my-app --yes
  create-stackpress my-app --type minimal --db pglite --dry-run`;
}

export function versionText(): string {
  return [
    `create-stackpress ${CLI_VERSION}`,
    `template ${TEMPLATE_VERSION}`,
    `stackpress ${STACKPRESS_VERSION}`
  ].join('\n');
}
