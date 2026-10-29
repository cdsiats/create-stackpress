#!/usr/bin/env node
import { helpText, parseCliArgs, versionText } from './args.js';
import { CliError, errorMessage, exitCodeForError } from './errors.js';

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

  console.log('create-stackpress: implementation in progress');
} catch (error) {
  console.error(`Error: ${errorMessage(error)}`);
  if (error instanceof CliError && error.hint) {
    console.error(error.hint);
  }
  process.exitCode = exitCodeForError(error);
}
