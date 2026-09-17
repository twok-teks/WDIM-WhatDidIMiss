import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Uses the small FFmpeg build installed with Playwright. No extra runtime dependency.
const browserRoot = path.resolve(chromium.executablePath(), '../../..');
const ffmpegDir = (await readdir(browserRoot))
  .filter((name) => name.startsWith('ffmpeg-'))
  .sort()
  .at(-1);
if (!ffmpegDir) throw new Error('Run npm run browser:install first.');
const ffmpegFiles = await readdir(path.join(browserRoot, ffmpegDir));
const binary = ffmpegFiles.find(
  (name) => name.startsWith('ffmpeg-') && !name.endsWith('.txt'),
);
if (!binary) throw new Error('Could not locate Playwright FFmpeg.');
const fixtureDir = fileURLToPath(new URL('../fixtures', import.meta.url));
await mkdir(fixtureDir, { recursive: true });
const encoder = spawn(
  path.join(browserRoot, ffmpegDir, binary),
  [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'image2pipe',
    '-framerate',
    '1',
    '-vcodec',
    'mjpeg',
    '-i',
    'pipe:0',
    '-c:v',
    'libvpx',
    '-b:v',
    '120k',
    '-g',
    '1',
    path.join(fixtureDir, 'sample.webm'),
  ],
  { stdio: ['pipe', 'inherit', 'inherit'], windowsHide: true },
);
const done = once(encoder, 'exit');
const browser = await chromium.launch({ channel: 'chromium' });
try {
  const page = await browser.newPage();
  await page.setContent('<canvas width="960" height="540"></canvas>');
  for (let second = 0; second < 90; second++) {
    const data = await page.evaluate((time) => {
      const canvas = document.querySelector('canvas');
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#26342e';
      ctx.fillRect(0, 0, 960, 540);
      ctx.fillStyle = '#9caa8e';
      ctx.beginPath();
      ctx.arc(700 + time / 8, 126, 43, 0, Math.PI * 2);
      ctx.fill();
      const ridge = (points, color) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(0, 540);
        points.forEach(([x, y]) => ctx.lineTo(x, y));
        ctx.lineTo(960, 540);
        ctx.closePath();
        ctx.fill();
      };
      ridge(
        [
          [0, 340],
          [130, 200],
          [250, 330],
          [430, 170],
          [660, 350],
          [830, 235],
          [960, 320],
        ],
        '#506150',
      );
      ridge(
        [
          [0, 380],
          [180, 335],
          [360, 400],
          [640, 290],
          [800, 360],
          [960, 320],
        ],
        '#344a3d',
      );
      ridge(
        [
          [0, 460],
          [160, 410],
          [400, 440],
          [700, 385],
          [960, 450],
        ],
        '#1b3027',
      );
      ctx.fillStyle = '#ccd4be';
      ctx.font = '14px sans-serif';
      ctx.fillText('THE QUIET INTERVAL', 42, 50);
      ctx.font = '12px monospace';
      ctx.fillText(
        `${String(Math.floor(time / 60)).padStart(2, '0')}:${String(time % 60).padStart(2, '0')} / 01:30`,
        42,
        500,
      );
      ctx.fillStyle = '#8f9f83';
      ctx.fillRect(42, 516, (876 * (time + 1)) / 90, 2);
      return canvas.toDataURL('image/jpeg').split(',')[1];
    }, second);
    if (!encoder.stdin.write(Buffer.from(data, 'base64')))
      await once(encoder.stdin, 'drain');
  }
  encoder.stdin.end();
  const [code] = await done;
  if (code !== 0) throw new Error(`FFmpeg exited with ${code}`);
  console.log(
    'Generated fixtures/sample.webm (90 seconds, silent VP8, 1 fps).',
  );
} finally {
  await browser.close();
  if (encoder.exitCode === null) encoder.kill();
}
