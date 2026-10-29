#!/usr/bin/env node
import { helpText, parseCliArgs, versionText } from './args.js';
import { resolveCreateOptions } from './create/interaction.js';
import { CliError, errorMessage, exitCodeForError } from './errors.js';
import { createOutput } from './output.js';
import { CLI_VERSION } from './version.js';

try {
  const options = parseCliArgs(process.argv.slice(2));

  if (options.help) {
    console.log(helpText());
    process.exit(0);
  }

  if (options.version) {
    console.log(versionText());
    process.exit(0);
  }

  const resolved = await resolveCreateOptions(options);

  if (!resolved) {
    console.log('Cancelled. No files were written.');
    process.exit(0);
  }

  const output = createOutput({ noColor: resolved.noColor });
  output.heading(`create-stackpress ${CLI_VERSION}`);
  output.info('Implementation in progress: project generation is not wired yet.');
  output.line();
  output.step(`Target: ${resolved.directory}`);
  output.step(`Type: ${resolved.type}`);
  output.step(`Database: ${resolved.database}`);
  output.step(`Package manager: ${resolved.packageManager}`);
  output.step(`Install: ${resolved.install ? 'yes' : 'no'}`);
  output.step(`Git: ${resolved.git ? 'yes' : 'no'}`);
} catch (error) {
  console.error(`Error: ${errorMessage(error)}`);
  if (error instanceof CliError && error.hint) {
    console.error(error.hint);
  }
  process.exitCode = exitCodeForError(error);
}
