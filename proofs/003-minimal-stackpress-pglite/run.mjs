import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';

const cwd = process.cwd();
const healthUrl = 'http://127.0.0.1:3000/health';
const timeoutMs = 30000;

let output = '';
let exited = null;

const child = spawn('npm.cmd', ['run', 'dev'], {
  cwd,
  shell: true,
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe']
});

child.stdout.on('data', (chunk) => { output += chunk; });
child.stderr.on('data', (chunk) => { output += chunk; });
child.on('exit', (code, signal) => { exited = { code, signal }; });

function cleanup() {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

async function waitForHealth() {
  const started = Date.now();
  let lastError = '';

  while (Date.now() - started < timeoutMs) {
    if (exited) {
      throw new Error(`Server exited before health check (code ${exited.code}).\n${output}`);
    }

    try {
      const response = await fetch(healthUrl, { signal: AbortSignal.timeout(2000) });
      if (response.status === 200) return response;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Health check timed out: ${lastError}\n${output}`);
}

try {
  const response = await waitForHealth();
  const body = await response.json();

  assert.equal(response.status, 200, 'Health route should return 200');
  assert.equal(body.ok, true, 'Health payload should be ok');
  assert.equal(body.database, 'registered', 'Database plugin should be registered');
  assert.deepEqual(body.query, [{ ok: 1 }], 'PGlite query should return one row');

  console.log('PASS: stackpress server booted');
  console.log('PASS: /health returned 200');
  console.log('PASS: PGlite database plugin registered');
  console.log('PASS: database query returned [{ ok: 1 }]');
  console.log('');
  console.log('Observed health response:');
  console.log(JSON.stringify(body, null, 2));
} finally {
  cleanup();
}
