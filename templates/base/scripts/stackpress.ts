#!/usr/bin/env tsx
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { server as http } from '@stackpress/ingest/http';
import Terminal from 'stackpress-server/Terminal';
import plugin from 'stackpress-server/plugin';

function bootstrapArgument(args: string[]): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '-b' || arg === '--b' || arg === '--bootstrap') {
      return args[index + 1];
    }
    if (arg.startsWith('--b=')) return arg.slice('--b='.length);
    if (arg.startsWith('--bootstrap=')) {
      return arg.slice('--bootstrap='.length);
    }
  }
  return process.env.BOOTSTRAP;
}

function withoutBootstrapArguments(args: string[]): string[] {
  const result: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '-b' || arg === '--b' || arg === '--bootstrap') {
      index += 1;
      continue;
    }
    if (arg.startsWith('--b=') || arg.startsWith('--bootstrap=')) continue;
    result.push(arg);
  }
  return result;
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const args = withoutBootstrapArguments(rawArgs);
  const bootstrap = bootstrapArgument(rawArgs);
  const bootstrapPath = bootstrap
    ? path.resolve(process.cwd(), bootstrap)
    : undefined;
  const imports = bootstrapPath
    ? await import(pathToFileURL(bootstrapPath).href)
    : {};
  const bootstrapFunction = imports.default;

  if (typeof bootstrapFunction === 'function') {
    const server = await bootstrapFunction();
    plugin(server);
    const terminal = new Terminal(args, server);
    await terminal.run();
    return;
  }

  const server = http();
  server.config.set(
    bootstrapFunction && typeof bootstrapFunction === 'object'
      ? bootstrapFunction
      : {}
  );
  const terminal = new Terminal(args, server);
  plugin(server);
  await terminal.bootstrap();
  await terminal.run();
}

main().then(() => {
  if (process.argv[2] !== 'serve') {
    process.exit(0);
  }
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
