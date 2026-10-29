export type OutputStream = {
  isTTY?: boolean;
  write(chunk: string): unknown;
};

export type OutputOptions = {
  color?: boolean;
  noColor?: boolean;
  stdout?: OutputStream;
  stderr?: OutputStream;
  env?: NodeJS.ProcessEnv;
};

const ANSI = {
  reset: '\u001b[0m',
  bold: '\u001b[1m',
  dim: '\u001b[2m',
  red: '\u001b[31m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  cyan: '\u001b[36m'
} as const;

export function shouldUseColor(options: {
  stream?: OutputStream;
  noColor?: boolean;
  env?: NodeJS.ProcessEnv;
} = {}): boolean {
  if (options.noColor) return false;
  if (options.env?.NO_COLOR) return false;
  return Boolean(options.stream?.isTTY);
}

export function paint(
  text: string,
  style: keyof typeof ANSI,
  enabled: boolean
): string {
  return enabled ? `${ANSI[style]}${text}${ANSI.reset}` : text;
}

export function createOutput(options: OutputOptions = {}) {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const env = options.env ?? process.env;
  const color = options.color ?? shouldUseColor({
    stream: stdout,
    noColor: options.noColor,
    env
  });

  const write = (stream: OutputStream, text: string): void => {
    stream.write(`${text}\n`);
  };

  return {
    color,
    heading(text: string): void {
      write(stdout, paint(text, 'bold', color));
    },
    step(text: string): void {
      write(stdout, `${paint('›', 'cyan', color)} ${text}`);
    },
    info(text: string): void {
      write(stdout, paint(text, 'dim', color));
    },
    success(text: string): void {
      write(stdout, `${paint('✓', 'green', color)} ${text}`);
    },
    warn(text: string): void {
      write(stderr, `${paint('!', 'yellow', color)} ${text}`);
    },
    error(text: string): void {
      write(stderr, `${paint('✗', 'red', color)} ${text}`);
    },
    line(text = ''): void {
      write(stdout, text);
    }
  };
}

export type Output = ReturnType<typeof createOutput>;
