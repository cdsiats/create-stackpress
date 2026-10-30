#!/usr/bin/env node
import { helpText, parseCliArgs, versionText } from './args.js';
import { CliError, errorMessage, exitCodeForError } from './errors.js';

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));
  const explicitType = options.type !== undefined;
  const explicitDatabase = options.database !== undefined;

  if (options.help) {
    console.log(helpText());
    return;
  }

  if (options.version) {
    console.log(versionText());
    return;
  }

  // Keep --help and --version cheap: only the create path loads prompts,
  // archive extraction, install, git, and the template resolver.
  const [
    { resolveCreateOptions },
    { buildCreatePlan, inferPackageManagerSource },
    { runCreate },
    { initializeGit },
    { installDependencies },
    { createOutput }
  ] = await Promise.all([
    import('./create/interaction.js'),
    import('./create/plan.js'),
    import('./create/workflow.js'),
    import('./git/index.js'),
    import('./package-manager/install.js'),
    import('./output.js')
  ]);

  const resolved = await resolveCreateOptions(options);

  if (!resolved) {
    console.log('Cancelled. No files were written.');
    return;
  }

  const plan = buildCreatePlan(resolved);
  const output = createOutput({ noColor: resolved.noColor });
  const packageManagerSource = options.packageManager
    ? 'selected with --pm'
    : inferPackageManagerSource(resolved.packageManager);

  await runCreate({
    plan,
    databaseUrl: resolved.databaseUrl,
    cwd: process.cwd(),
    output,
    packageManagerSource,
    explicitType,
    explicitDatabase,
    dependencies: {
      install: installDependencies,
      git: initializeGit
    }
  });
}

main().catch((error: unknown) => {
  console.error(`Error: ${errorMessage(error)}`);
  if (error instanceof CliError && error.hint) {
    console.error(error.hint);
  }
  process.exitCode = exitCodeForError(error);
});
