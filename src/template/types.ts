import type { CreatePlan } from '../types.js';

export const FRAGMENT_KINDS = ['base', 'type', 'database'] as const;
export type FragmentKind = (typeof FRAGMENT_KINDS)[number];

export const TOKEN_NAMES = [
  'name',
  'type',
  'database',
  'adapter',
  'driver'
] as const;
export type TokenName = (typeof TOKEN_NAMES)[number];
export type TemplateTokens = Partial<Record<TokenName, string>>;

export type FragmentPackage = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  plugins?: string[];
};

export type FragmentManifest = {
  schemaVersion: 1;
  id: string;
  kind: FragmentKind;
  requires?: string[];
  capabilities?: string[];
  files?: string[];
  assets?: string[];
  package?: FragmentPackage;
  env?: string[];
};

export type ResolvedFile = {
  path: string;
  contents: string | Uint8Array;
  binary: boolean;
  fragmentId: string;
};

export type ResolvedProject = {
  plan: CreatePlan;
  files: ResolvedFile[];
  packageJson: Record<string, unknown>;
  capabilities: string[];
  env: string[];
  plugins: string[];
  warnings: string[];
};

export type WriteOptions = {
  targetDir: string;
  overwrite: boolean;
  validate?: (stagingDir: string) => Promise<void> | void;
};

export type WriteResult = {
  targetDir: string;
  warnings: string[];
};
