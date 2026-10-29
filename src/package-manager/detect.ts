import {
  PACKAGE_MANAGERS,
  isPackageManager,
  type PackageManager
} from '../types.js';

const LOCKFILES: Array<[PackageManager, string[]]> = [
  ['pnpm', ['pnpm-lock.yaml']],
  ['yarn', ['yarn.lock']],
  ['bun', ['bun.lock', 'bun.lockb']],
  ['npm', ['package-lock.json', 'npm-shrinkwrap.json']]
];

export type DetectPackageManagerOptions = {
  userAgent?: string;
  packageManager?: string;
  lockfiles?: string[];
};

export function detectPackageManager(
  options: DetectPackageManagerOptions = {}
): PackageManager {
  const userAgent = options.userAgent ?? process.env.npm_config_user_agent;

  if (userAgent) {
    for (const manager of PACKAGE_MANAGERS) {
      if (userAgent.startsWith(`${manager}/`)) return manager;
    }
  }

  const declared = options.packageManager;
  if (declared) {
    const name = declared.split('@')[0];
    if (name && isPackageManager(name)) return name;
  }

  const lockfiles = options.lockfiles ?? [];
  for (const [manager, names] of LOCKFILES) {
    if (names.some((name) => lockfiles.includes(name))) return manager;
  }

  return 'npm';
}
