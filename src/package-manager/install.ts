import { spawn } from 'node:child_process';
import type { InstallContext, InstallOutcome } from '../create/workflow.js';
import { CliError } from '../errors.js';
import {
  getInstallCommand,
  usesShellForPackageManager,
  type PackageManagerCommand
} from './commands.js';

/**
 * Test and future-flag hooks for install execution. The CLI calls
 * `installDependencies(context)` with defaults only.
 */
export type InstallExecutionOptions = {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  extraArgs?: readonly string[];
  timeoutMs?: number;
};

type ProcessResult = {
  ok: boolean;
  code: number | null;
  errorCode?: string;
};

function errorCodeOf(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined;
  }
  const code = (error as NodeJS.ErrnoException).code;
  return typeof code === 'string' ? code : undefined;
}

function runInstallProcess(
  command: PackageManagerCommand,
  cwd: string,
  options: InstallExecutionOptions
): Promise<ProcessResult> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: ProcessResult): void => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    try {
      const child = spawn(command.executable, command.args, {
        cwd,
        env: { ...process.env, ...(options.env ?? {}) },
        // Windows `.cmd` shims require a shell; POSIX must not use one.
        shell: usesShellForPackageManager(options.platform),
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'ignore'],
        timeout: options.timeoutMs
      });

      child.once('error', (error) => {
        finish({ ok: false, code: null, errorCode: errorCodeOf(error) });
      });
      child.once('close', (code) => {
        finish({ ok: code === 0, code });
      });
    } catch (error) {
      finish({ ok: false, code: null, errorCode: errorCodeOf(error) });
    }
  });
}

function failureMessage(
  command: PackageManagerCommand,
  result: ProcessResult
): string {
  if (result.errorCode === 'ENOENT') {
    return `Package manager executable "${command.executable}" was not found while running "${command.display}".`;
  }
  if (result.code === null) {
    const detail = result.errorCode ? ` (${result.errorCode})` : '';
    return `"${command.display}" could not be started${detail}.`;
  }
  return `"${command.display}" exited with code ${result.code}.`;
}

function retryHint(
  context: InstallContext,
  command: PackageManagerCommand
): string {
  return `The project was created at ${context.targetDir}. Retry with "cd ${context.targetDir}" and "${command.display}", or scaffold without installing by passing --no-install.`;
}

/**
 * Runs the selected package manager's install command inside the generated
 * project. The command is fixed and printed without environment details; the
 * generated project is never deleted when the install fails.
 */
export async function installDependencies(
  context: InstallContext,
  options: InstallExecutionOptions = {}
): Promise<InstallOutcome> {
  const command = getInstallCommand(context.plan.packageManager, {
    platform: options.platform,
    extraArgs: options.extraArgs
  });

  context.output.step(`Running ${command.display} in ${context.targetDir}`);
  const result = await runInstallProcess(command, context.targetDir, options);

  if (result.ok) {
    context.output.step(`Installed dependencies with ${command.display}.`);
    return { installed: true };
  }

  throw CliError.install(
    failureMessage(command, result),
    retryHint(context, command)
  );
}
