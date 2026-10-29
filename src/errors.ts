export type CliErrorCode =
  | 'USAGE'
  | 'PREFLIGHT'
  | 'GENERATION'
  | 'INSTALL'
  | 'INTERRUPTED';

const EXIT_CODES: Record<CliErrorCode, number> = {
  USAGE: 2,
  PREFLIGHT: 2,
  GENERATION: 1,
  INSTALL: 1,
  INTERRUPTED: 130
};

export class CliError extends Error {
  public readonly code: CliErrorCode;
  public readonly exitCode: number;
  public readonly hint?: string;

  public constructor(code: CliErrorCode, message: string, hint?: string) {
    super(message);
    this.name = 'CliError';
    this.code = code;
    this.exitCode = EXIT_CODES[code];
    this.hint = hint;
  }

  public static usage(message: string, hint?: string): CliError {
    return new CliError('USAGE', message, hint);
  }

  public static preflight(message: string, hint?: string): CliError {
    return new CliError('PREFLIGHT', message, hint);
  }

  public static generation(message: string, hint?: string): CliError {
    return new CliError('GENERATION', message, hint);
  }

  public static install(message: string, hint?: string): CliError {
    return new CliError('INSTALL', message, hint);
  }

  public static interrupted(message = 'Interrupted.'): CliError {
    return new CliError('INTERRUPTED', message);
  }
}

export function exitCodeForError(error: unknown): number {
  if (error instanceof CliError) return error.exitCode;
  return 1;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
