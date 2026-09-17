import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../fixtures/', import.meta.url));
const routes = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/fixture.css', ['fixture.css', 'text/css; charset=utf-8']],
  ['/fixture.js', ['fixture.js', 'text/javascript; charset=utf-8']],
  ['/sample.webm', ['sample.webm', 'video/webm']],
  ['/players.html', ['players.html', 'text/html; charset=utf-8']],
  ['/players.js', ['players.js', 'text/javascript; charset=utf-8']],
  ['/embedded.html', ['embedded.html', 'text/html; charset=utf-8']],
  ['/embedded.js', ['embedded.js', 'text/javascript; charset=utf-8']],
]);

export async function startFixtureServer() {
  const server = createServer(async (request, response) => {
    const route = routes.get(new URL(request.url, 'http://localhost').pathname);
    if (!route || !['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(404).end();
      return;
    }
    const [file, type] = route;
    const filename = path.join(root, file);
    try {
      const { size } = await stat(filename);
      let start = 0;
      let end = size - 1;
      const range = request.headers.range;
      if (range) {
        const match = /^bytes=(\d+)-(\d*)$/.exec(range);
        if (!match) {
          response.writeHead(416, { 'Content-Range': `bytes */${size}` }).end();
          return;
        }
        start = Number(match[1]);
        end = match[2] ? Math.min(Number(match[2]), end) : end;
        if (start > end || start >= size) {
          response.writeHead(416, { 'Content-Range': `bytes */${size}` }).end();
          return;
        }
      }
      response.writeHead(range ? 206 : 200, {
        'Content-Type': type,
        'Content-Length': end - start + 1,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store',
        ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}),
      });
      if (request.method === 'HEAD') response.end();
      else
        createReadStream(filename, { start, end })
          .on('error', () => response.destroy())
          .pipe(response);
    } catch {
      response
        .writeHead(500)
        .end('Fixture asset missing. See fixtures/README.md.');
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    // IPv4 loopback serves both localhost and 127.0.0.1 for cross-origin frame tests.
    server.listen(3000, '127.0.0.1', resolve);
  });
  console.log('Video fixture: http://localhost:3000 (local files only)');
  return server;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const server = await startFixtureServer();
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => server.close(() => process.exit(0)));
}
