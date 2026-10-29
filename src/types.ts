export const PROJECT_TYPES = [
  'full-stack',
  'api-only',
  'minimal',
  'admin-only'
] as const;

export const DATABASES = [
  'pglite',
  'postgres',
  'cockroachdb',
  'mysql',
  'sqlite'
] as const;

export const PACKAGE_MANAGERS = ['npm', 'pnpm', 'yarn', 'bun'] as const;

export type ProjectType = (typeof PROJECT_TYPES)[number];
export type DatabaseId = (typeof DATABASES)[number];
export type PackageManager = (typeof PACKAGE_MANAGERS)[number];

export type CreateOptions = {
  directory?: string;
  type?: ProjectType;
  database?: DatabaseId;
  packageManager?: PackageManager;
  install?: boolean;
  git?: boolean;
  template?: string;
  databaseUrl?: string;
  overwrite?: boolean;
  dryRun?: boolean;
  yes?: boolean;
  noInput?: boolean;
  noColor?: boolean;
  noAgentsMd?: boolean;
  help?: boolean;
  version?: boolean;
};

export type CreatePlan = {
  targetDir: string;
  packageName: string;
  type: ProjectType;
  database: DatabaseId;
  packageManager: PackageManager;
  install: boolean;
  git: boolean;
  template?: string;
  overwrite: boolean;
  dryRun: boolean;
  noAgentsMd: boolean;
};

export type CreateResult = {
  plan: CreatePlan;
  installed: boolean;
  gitInitialized: boolean;
  warnings: string[];
  nextSteps: string[];
};

export function isProjectType(value: string): value is ProjectType {
  return (PROJECT_TYPES as readonly string[]).includes(value);
}

export function isDatabaseId(value: string): value is DatabaseId {
  return (DATABASES as readonly string[]).includes(value);
}

export function isPackageManager(value: string): value is PackageManager {
  return (PACKAGE_MANAGERS as readonly string[]).includes(value);
}
