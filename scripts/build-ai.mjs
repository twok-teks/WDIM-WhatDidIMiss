import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const child = spawn(
  process.execPath,
  [
    fileURLToPath(new URL('../node_modules/wxt/bin/wxt.mjs', import.meta.url)),
    'build',
    '-b',
    process.argv.includes('--firefox') ? 'firefox' : 'chrome',
    '--mv3',
  ],
  {
    stdio: 'inherit',
    windowsHide: true,
    env: { ...process.env, WDIM_AI_MODE: 'groq' },
  },
);
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
child.on('error', () => {
  console.error('AI build failed to start.');
  process.exitCode = 1;
});
