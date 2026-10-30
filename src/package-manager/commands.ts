import type { PackageManager } from '../types.js';

/**
 * Fixed command prefixes for each supported package manager. Every command the
 * CLI runs is assembled from this map; dynamic values (script names, extra
 * flags) are validated before they are appended.
 */
const COMMAND_MAP: Record<
  PackageManager,
  { install: readonly string[]; run: readonly string[] }
> = {
  npm: { install: ['install'], run: ['run'] },
  pnpm: { install: ['install'], run: ['run'] },
  yarn: { install: ['install'], run: ['run'] },
  bun: { install: ['install'], run: ['run'] }
};

/** Scripts the CLI contract prints as next steps, in contract order. */
export const NEXT_STEP_SCRIPTS = ['generate', 'push', 'dev'] as const;
export type NextStepScript = (typeof NEXT_STEP_SCRIPTS)[number];

/**
 * Positive allowlist for literal command arguments. It permits package names,
 * version ranges, and flags, while rejecting whitespace and every shell
 * metacharacter (`& | < > ^ % ( ) ; $ ` " ' \ * ? [ ] { } # ~ !`).
 */
const SAFE_ARGUMENT = /^[A-Za-z0-9@._:/+=-]+$/;

/**
 * Script names are appended after `run`, so they must not look like flags and
 * must stay within the same safe character set.
 */
const SAFE_SCRIPT_NAME = /^[A-Za-z0-9][A-Za-z0-9:_.-]*$/;

export type PackageManagerCommand = {
  manager: PackageManager;
  /** Executable name resolved for the current platform. */
  executable: string;
  args: string[];
  /** Human-readable command without the executable suffix. */
  display: string;
};

export type CommandOptions = {
  platform?: NodeJS.Platform;
};

export type InstallCommandOptions = CommandOptions & {
  /**
   * Additional allowlisted flags. The CLI itself does not add any; tests use
   * this to keep real installs offline and script-free.
   */
  extraArgs?: readonly string[];
};

/**
 * Rejects an argument that could be interpreted by a shell or that is empty.
 * With `shell: true` on Windows, Node does not escape arguments, so this check
 * is the boundary that keeps the fixed command layer safe.
 */
export function assertSafeArguments(args: readonly string[]): void {
  for (const arg of args) {
    if (typeof arg !== 'string' || !SAFE_ARGUMENT.test(arg)) {
      throw new Error(`Unsafe package-manager argument: ${JSON.stringify(arg)}`);
    }
  }
}

/**
 * Windows package managers are `.cmd` shims (except bun, which ships an
 * executable). POSIX invokes the plain manager name.
 */
export function resolvePackageManagerExecutable(
  manager: PackageManager,
  platform: NodeJS.Platform = process.platform
): string {
  if (platform !== 'win32') return manager;
  return manager === 'bun' ? 'bun.exe' : `${manager}.cmd`;
}

/**
 * Windows `.cmd` shims cannot be launched with `shell: false` (proof P-002);
 * POSIX must never use a shell.
 */
export function usesShellForPackageManager(
  platform: NodeJS.Platform = process.platform
): boolean {
  return platform === 'win32';
}

function commandParts(
  manager: PackageManager
): { install: readonly string[]; run: readonly string[] } {
  const parts = COMMAND_MAP[manager] as
    | { install: readonly string[]; run: readonly string[] }
    | undefined;
  if (!parts) {
    throw new Error(`Unsupported package manager: ${manager}`);
  }
  return parts;
}

function buildCommand(
  manager: PackageManager,
  args: readonly string[],
  options: CommandOptions
): PackageManagerCommand {
  assertSafeArguments(args);
  return {
    manager,
    executable: resolvePackageManagerExecutable(manager, options.platform),
    args: [...args],
    display: [manager, ...args].join(' ')
  };
}

/** `<pm> install`, optionally followed by allowlisted flags. */
export function getInstallCommand(
  manager: PackageManager,
  options: InstallCommandOptions = {}
): PackageManagerCommand {
  const parts = commandParts(manager);
  return buildCommand(
    manager,
    [...parts.install, ...(options.extraArgs ?? [])],
    options
  );
}

/** `<pm> run <script>` for a validated script name. */
export function getRunScriptCommand(
  manager: PackageManager,
  script: string,
  options: CommandOptions = {}
): PackageManagerCommand {
  if (!SAFE_SCRIPT_NAME.test(script)) {
    throw new Error(`Unsafe package-manager script name: ${JSON.stringify(script)}`);
  }
  const parts = commandParts(manager);
  return buildCommand(manager, [...parts.run, script], options);
}

/** Renders a command exactly as it is printed to the user. */
export function formatPackageManagerCommand(
  command: PackageManagerCommand
): string {
  return command.display;
}

/**
 * Exact next-step commands from the CLI contract: `<pm> install`,
 * `<pm> run generate`, `<pm> run push`, `<pm> run dev`.
 */
export function getNextStepCommands(
  manager: PackageManager,
  scripts: readonly string[] = NEXT_STEP_SCRIPTS,
  options: CommandOptions = {}
): string[] {
  return [
    getInstallCommand(manager, options).display,
    ...scripts.map((script) => getRunScriptCommand(manager, script, options).display)
  ];
}
