import { spinner } from '@clack/prompts';

/**
 * Minimal progress surface used by the create workflow. The interactive CLI
 * implements it with a spinner; non-interactive runs omit it entirely.
 */
export type Progress = {
  start(message: string): void;
  update(message: string): void;
  clear(): void;
  stop(message?: string): void;
  fail(message: string): void;
};

export function createProgress(): Progress {
  const spin = spinner({
    onCancel: () => {
      // The spinner removes its own signal listeners before calling this
      // callback. Re-raise SIGINT so the existing write cleanup (or Node's
      // default signal handling) still runs instead of silently continuing.
      try {
        process.kill(process.pid, 'SIGINT');
      } catch {
        process.exit(130);
      }
    }
  });
  let active = false;

  return {
    start(message) {
      if (active) {
        spin.message(message);
        return;
      }
      spin.start(message);
      active = true;
    },
    update(message) {
      if (!active) {
        spin.start(message);
        active = true;
        return;
      }
      spin.message(message);
    },
    stop(message) {
      if (!active) return;
      active = false;
      spin.stop(message);
    },
    clear() {
      if (!active) return;
      active = false;
      spin.clear();
    },
    fail(message) {
      if (!active) return;
      active = false;
      spin.error(message);
    }
  };
}
