export const PACKAGE_JSON_FILE = 'package.json';
export const ENV_SAMPLE_FILE = '.env.sample';
export const GITIGNORE_FILE = 'gitignore';
export const RENDERED_GITIGNORE_FILE = '.gitignore';

/** Maps the template-owned `gitignore` file to its rendered name. */
export function renderOutputPath(relative: string): string {
  const segments = relative.split('/');
  for (let index = 0; index < segments.length; index += 1) {
    if (segments[index] === GITIGNORE_FILE) {
      segments[index] = RENDERED_GITIGNORE_FILE;
    }
  }
  return segments.join('/');
}

/** Renders template text with deterministic LF newlines. */
export function normalizeNewlines(value: string): string {
  return value.replace(/\r\n?/g, '\n');
}

export function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  );
}
