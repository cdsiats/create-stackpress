import { spawn } from 'node:child_process';
import type { GitContext, GitOutcome } from '../create/workflow.js';

/**
 * Test hooks for git execution. Production calls `initializeGit(context)`.
 */
export type GitExecutionOptions = {
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  executable?: string;
};

type GitResult = {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  errorCode?: string;
};

const MANUAL_STEPS =
  'run git init, git add ., and git commit -m "Initial commit" manually';

function errorCodeOf(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined;
  }
  const code = (error as NodeJS.ErrnoException).code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * Git commands always run with `shell: false` so arguments such as
 * `-m "Initial commit"` stay literal.
 */
function runGit(
  args: readonly string[],
  cwd: string,
  options: GitExecutionOptions
): Promise<GitResult> {
  return new Promise((resolve) => {
    let settled = false;
    let stdout = '';
    let stderr = '';
    const finish = (result: GitResult): void => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    try {
      const child = spawn(options.executable ?? 'git', args, {
        cwd,
        env: {
          GIT_TERMINAL_PROMPT: '0',
          ...process.env,
          ...(options.env ?? {})
        },
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: options.timeoutMs
      });

      child.stdout?.on('data', (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });
      child.stderr?.on('data', (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });
      child.once('error', (error) => {
        finish({
          ok: false,
          code: null,
          stdout,
          stderr,
          errorCode: errorCodeOf(error)
        });
      });
      child.once('close', (code) => {
        finish({ ok: code === 0, code, stdout, stderr });
      });
    } catch (error) {
      finish({
        ok: false,
        code: null,
        stdout,
        stderr,
        errorCode: errorCodeOf(error)
      });
    }
  });
}

function missingGitWarning(): string {
  return `git was not found. Skipping git initialization; ${MANUAL_STEPS} after scaffolding.`;
}

function failureWarning(step: string, result: GitResult): string {
  if (result.errorCode === 'ENOENT') return missingGitWarning();
  const detail =
    result.code === null
      ? result.errorCode ?? 'unknown error'
      : `exit code ${result.code}`;
  return `Git initialization failed at "${step}" (${detail}). The project was created; ${MANUAL_STEPS}.`;
}

/**
 * Initializes a repository in the generated project with `git init`,
 * `git add .`, and `git commit -m "Initial commit"`.
 *
 * - An existing enclosing worktree is never nested: initialization is skipped,
 *   a warning is returned, and the project is reported as initialized.
 * - Missing git or any failing step returns `initialized: false` plus a warning
 *   so the workflow can keep the project and exit 0.
 */
export async function initializeGit(
  context: GitContext,
  options: GitExecutionOptions = {}
): Promise<GitOutcome> {
  const cwd = context.targetDir;

  const worktree = await runGit(
    ['rev-parse', '--is-inside-work-tree'],
    cwd,
    options
  );

  if (!worktree.ok && worktree.errorCode === 'ENOENT') {
    return { initialized: false, warnings: [missingGitWarning()] };
  }

  if (worktree.ok && worktree.stdout.trim() === 'true') {
    return {
      initialized: true,
      warnings: [
        'Target is already inside a git worktree; skipped git init to avoid creating a nested repository.'
      ]
    };
  }

  const steps: Array<{ label: string; args: string[] }> = [
    { label: 'git init', args: ['init'] },
    { label: 'git add .', args: ['add', '.'] },
    {
      label: 'git commit -m "Initial commit"',
      args: ['commit', '-m', 'Initial commit']
    }
  ];

  for (const step of steps) {
    context.output.step(`Running ${step.label}`);
    const result = await runGit(step.args, cwd, options);
    if (!result.ok) {
      return {
        initialized: false,
        warnings: [failureWarning(step.label, result)]
      };
    }
  }

  context.output.step('Initialized git repository.');
  return { initialized: true, warnings: [] };
}
