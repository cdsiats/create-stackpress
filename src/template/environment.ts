import { CliError } from '../errors.js';
import { compareStrings, parseEnvLine } from './manifest.js';
import { ENV_SAMPLE_FILE } from './paths.js';
import type { ResolvedFile, TemplateTokens } from './types.js';
import { assertNoUnresolvedTokens, renderTokens } from './validate.js';

export type EnvEntry = {
  key: string;
  value: string;
  owner: string;
};

function fail(message: string, hint?: string): never {
  throw CliError.generation(message, hint);
}

export function setEnvEntry(
  entries: Map<string, EnvEntry>,
  key: string,
  value: string,
  owner: string
): void {
  const existing = entries.get(key);
  if (existing) {
    if (existing.value !== value) {
      fail(
        `Conflicting env key "${key}" between ${existing.owner} and ${owner}: "${existing.value}" and "${value}".`
      );
    }
    return;
  }
  entries.set(key, { key, value, owner });
}

/**
 * Parses non-comment KEY=value lines. Malformed lines are ignored to match
 * the fragment resolver; duplicate keys are errors.
 */
export function parseEnvSample(
  contents: string,
  source: string = ENV_SAMPLE_FILE
): Map<string, string> {
  const entries = new Map<string, string>();
  for (const line of contents.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue;
    const parsed = parseEnvLine(trimmed);
    if (!parsed) continue;
    if (entries.has(parsed.key)) {
      fail(`Duplicate env key "${parsed.key}" in ${source}.`);
    }
    entries.set(parsed.key, parsed.value);
  }
  return entries;
}

export type MergeEnvironmentOptions = {
  /** Manifest env lines with the owner label used in conflict errors. */
  entries: ReadonlyArray<{ line: string; owner: string }>;
  files: Map<string, ResolvedFile>;
  tokens: TemplateTokens;
  /** Fragment id used when the manifest/env lines add a new `.env.sample`. */
  fallbackFragmentId: string;
};

/**
 * Merges manifest env lines with `.env.sample`, renders allowlisted tokens,
 * rejects conflicts, appends missing keys to `.env.sample`, and returns the
 * sorted resolved env lines.
 */
export function mergeEnvironment(options: MergeEnvironmentOptions): string[] {
  const entries = new Map<string, EnvEntry>();

  for (const entry of options.entries) {
    const parsed = parseEnvLine(entry.line);
    if (!parsed) continue;
    const value = renderTokens(parsed.value, options.tokens);
    assertNoUnresolvedTokens(value, `env "${parsed.key}"`);
    setEnvEntry(entries, parsed.key, value, entry.owner);
  }

  const envFile = options.files.get(ENV_SAMPLE_FILE);
  const fileKeys = new Set<string>();
  if (envFile) {
    if (envFile.binary || typeof envFile.contents !== 'string') {
      fail(`${ENV_SAMPLE_FILE} must be a text file.`);
    }
    const fileEntries = parseEnvSample(envFile.contents, ENV_SAMPLE_FILE);
    for (const [key, value] of fileEntries) {
      fileKeys.add(key);
      setEnvEntry(entries, key, value, ENV_SAMPLE_FILE);
    }
  }

  const sortedKeys = [...entries.keys()].sort(compareStrings);
  const additions = sortedKeys.filter((key) => !fileKeys.has(key));

  if (additions.length > 0) {
    const additionLines = additions.map((key) => {
      const entry = entries.get(key);
      return `${key}=${entry?.value ?? ''}`;
    });
    if (envFile && typeof envFile.contents === 'string') {
      const trimmed = envFile.contents.replace(/\n+$/, '');
      envFile.contents =
        trimmed.length === 0
          ? `${additionLines.join('\n')}\n`
          : `${trimmed}\n${additionLines.join('\n')}\n`;
    } else {
      options.files.set(ENV_SAMPLE_FILE, {
        path: ENV_SAMPLE_FILE,
        contents: `${additionLines.join('\n')}\n`,
        binary: false,
        fragmentId: options.fallbackFragmentId
      });
    }
  }

  return sortedKeys.map((key) => {
    const entry = entries.get(key);
    return `${key}=${entry?.value ?? ''}`;
  });
}
