import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function run(file, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [fileURLToPath(new URL(file, import.meta.url)), ...args],
      { stdio: 'inherit', windowsHide: true, env },
    );
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0
        ? resolve()
        : reject(new Error('AI browser validation failed.')),
    );
  });
}
try {
  await run('./build-ai.mjs', []);
  const live = process.argv.includes('--live');
  if (live) {
    const { existsSync } = await import('node:fs');
    if (existsSync('server/.env')) process.loadEnvFile('server/.env');
    if (!process.env.GROQ_API_KEY)
      throw new Error('Configure the server key first.');
  }
  await run(
    '../node_modules/@playwright/test/cli.js',
    ['test', 'tests/e2e/ai.spec.ts'],
    { ...process.env, WDIM_E2E_AI: '1', WDIM_LIVE_AI: live ? '1' : '0' },
  );
} catch {
  console.error('AI browser validation failed. Review the test output above.');
  process.exitCode = 1;
}
