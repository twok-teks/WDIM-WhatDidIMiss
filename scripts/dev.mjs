import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { startFixtureServer } from './fixture-server.mjs';

const firefox = process.argv.includes('--firefox');
const manual = process.argv.includes('--manual');
if (!firefox && !manual && !existsSync(chromium.executablePath())) {
  console.error(
    'Install the development browser first: npm run browser:install',
  );
  process.exit(1);
}
const server = await startFixtureServer();
const child = spawn(
  process.execPath,
  [
    fileURLToPath(new URL('../node_modules/wxt/bin/wxt.mjs', import.meta.url)),
    '-b',
    firefox ? 'firefox' : 'chrome',
    '--mv3',
  ],
  {
    stdio: 'inherit',
    windowsHide: true,
    env: { ...process.env, WDIM_MANUAL: manual ? '1' : '0' },
  },
);
let closing = false;
const stop = (code = 0) => {
  if (closing) return;
  closing = true;
  child.kill();
  server.close(() => process.exit(code));
  server.closeAllConnections();
};
child.on('exit', (code) => stop(code ?? 0));
child.on('error', (error) => {
  console.error(error.message);
  stop(1);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop());
