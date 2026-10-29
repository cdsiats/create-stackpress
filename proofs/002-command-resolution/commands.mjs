import { spawn } from 'node:child_process';

export const PACKAGE_MANAGERS = ['npm', 'pnpm', 'yarn', 'bun'];

const LOCKFILES = [
  ['pnpm', ['pnpm-lock.yaml']],
  ['yarn', ['yarn.lock']],
  ['bun', ['bun.lock', 'bun.lockb']],
  ['npm', ['package-lock.json', 'npm-shrinkwrap.json']]
];

const COMMANDS = {
  npm: {
    install: ['install'],
    run: ['run'],
    exec: ['npx'],
    create: ['create'],
    version: ['--version']
  },
  pnpm: {
    install: ['install'],
    run: ['run'],
    exec: ['exec'],
    create: ['create'],
    version: ['--version']
  },
  yarn: {
    install: ['install'],
    run: ['run'],
    exec: ['yarn'],
    create: ['create'],
    version: ['--version']
  },
  bun: {
    install: ['install'],
    run: ['run'],
    exec: ['bunx'],
    create: ['create'],
    version: ['--version']
  }
};

const UNSAFE_ARGUMENT = /[&|<>^%()\r\n]/;

export function detectPackageManager(options = {}) {
  const {
    userAgent = process.env.npm_config_user_agent,
    packageJson,
    files = []
  } = options;

  if (userAgent) {
    for (const manager of PACKAGE_MANAGERS) {
      if (userAgent.startsWith(`${manager}/`)) return manager;
    }
  }

  const declared = packageJson?.packageManager;
  if (typeof declared === 'string' && declared.length > 0) {
    const name = declared.split('@')[0];
    if (PACKAGE_MANAGERS.includes(name)) return name;
  }

  for (const [manager, names] of LOCKFILES) {
    if (names.some((name) => files.includes(name))) return manager;
  }

  return 'npm';
}

export function resolveExecutable(manager, platform = process.platform) {
  if (!PACKAGE_MANAGERS.includes(manager)) {
    throw new Error(`Unsupported package manager: ${manager}`);
  }

  if (platform !== 'win32') return manager;

  return manager === 'bun' ? 'bun.exe' : `${manager}.cmd`;
}

export function getCommand(manager, action, args = []) {
  const command = COMMANDS[manager]?.[action];
  if (!command) throw new Error(`Unsupported command: ${manager} ${action}`);
  return { command: manager, args: [...command, ...args] };
}

export function formatCommand(manager, action, args = []) {
  const { command, args: parts } = getCommand(manager, action, args);
  return [command, ...parts].join(' ');
}

export function assertSafeArgs(args) {
  for (const arg of args) {
    if (UNSAFE_ARGUMENT.test(arg)) {
      throw new Error(`Unsafe package-manager argument: ${arg}`);
    }
  }
}

export function runPackageManager(manager, action, args = [], options = {}) {
  assertSafeArgs(args);
  const { command, args: parts } = getCommand(manager, action, args);
  const executable = resolveExecutable(manager, options.platform);

  // Windows .cmd shims cannot be launched with shell:false.
  const shell = options.shell ?? process.platform === 'win32';

  return runCommand(executable, parts, {
    ...options,
    shell
  }).then((result) => ({
    ...result,
    manager,
    action,
    display: [command, ...parts].join(' ')
  }));
}

export function runCommand(executable, args, options = {}) {
  const {
    cwd = process.cwd(),
    timeout = 15000,
    env = process.env,
    shell = false
  } = options;

  return new Promise((resolve) => {
    let child;

    try {
      child = spawn(executable, args, {
        cwd,
        env,
        shell,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });
    } catch (error) {
      resolve({
        ok: false,
        code: null,
        stdout: '',
        stderr: error.message,
        executable,
        error: error.code || error.name
      });
      return;
    }

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      resolve({ ok: false, code: null, stdout, stderr: `${stderr}\nTimed out`, executable });
    }, timeout);

    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: false,
        code: null,
        stdout,
        stderr: `${stderr}\n${error.message}`,
        executable,
        error: error.code || error.name
      });
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: code === 0, code, stdout, stderr, executable });
    });
  });
}

export function runVersion(manager, options = {}) {
  return runPackageManager(manager, 'version', [], options);
}
