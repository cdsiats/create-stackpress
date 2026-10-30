import {
  getInstallCommand,
  getRunScriptCommand
} from '../package-manager/commands.js';
import type { CreatePlan, DatabaseId } from '../types.js';

export type NextStepsOptions = {
  installed: boolean;
  gitInitialized: boolean;
  customTemplate?: boolean;
  scripts?: string[];
};

const DATABASE_URL_PREFIX = 'DATABASE_URL=';

const DEFAULT_DATABASE_URLS: Record<DatabaseId, string> = {
  pglite: './.build/database',
  postgres: 'postgres://postgres:postgres@localhost:5432/app',
  cockroachdb: 'postgres://root@localhost:26257/defaultdb?sslmode=disable',
  mysql: 'mysql://root:root@localhost:3306/app',
  sqlite: './.build/database.sqlite'
};

/**
 * Returns the expected DATABASE_URL placeholder from `.env.sample` (or the
 * database fragment env lines). This is never the user's `--db-url` value.
 */
export function findExpectedDatabaseUrl(env: string[]): string | undefined {
  for (const line of env) {
    if (line.startsWith(DATABASE_URL_PREFIX)) {
      return line.slice(DATABASE_URL_PREFIX.length);
    }
  }
  return undefined;
}

export function buildNextSteps(
  plan: CreatePlan,
  options: NextStepsOptions
): string[] {
  const steps = [`cd ${plan.targetDir}`];
  const runScript = (script: string): string =>
    getRunScriptCommand(plan.packageManager, script).display;

  if (!options.installed) {
    steps.push(getInstallCommand(plan.packageManager).display);
  }

  if (options.customTemplate) {
    const available = new Set(options.scripts ?? []);
    for (const script of ['generate', 'push', 'dev']) {
      if (available.has(script)) {
        steps.push(runScript(script));
      }
    }
  } else if (plan.type === 'minimal') {
    steps.push(runScript('dev'));
  } else {
    steps.push(runScript('generate'), runScript('push'), runScript('dev'));
  }

  if (!options.gitInitialized) {
    steps.push(
      'git init',
      'git add .',
      'git commit -m "Initial commit"'
    );
  }

  return steps;
}

/**
 * Describes the database prerequisite for the selected database. PGlite needs
 * no server; the server-backed databases and SQLite show their expected
 * DATABASE_URL instead of the user-supplied `--db-url` value.
 */
export function describeDatabasePrerequisite(
  database: DatabaseId,
  expectedUrl?: string
): string {
  const url = expectedUrl ?? DEFAULT_DATABASE_URLS[database];

  switch (database) {
    case 'pglite':
      return 'PGlite runs locally; no database server is required.';
    case 'postgres':
      return `PostgreSQL must be running and reachable. Expected DATABASE_URL: ${url}. Copy .env.sample to .env and adjust it if needed.`;
    case 'cockroachdb':
      return `CockroachDB must be running and reachable. Expected DATABASE_URL: ${url}. Copy .env.sample to .env and adjust it if needed.`;
    case 'mysql':
      return `MySQL must be running and reachable. Expected DATABASE_URL: ${url}. Copy .env.sample to .env and adjust it if needed.`;
    case 'sqlite':
      return `SQLite uses a local database file; no server is required, but the target directory must be writable. Expected DATABASE_URL: ${url}. Copy .env.sample to .env and adjust it if needed.`;
  }
}
