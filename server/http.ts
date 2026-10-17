import { createServer, type IncomingMessage } from 'node:http';
import type { GroundedService } from './grounded-service';

function readBody(
  request: IncomingMessage,
  signal: AbortSignal,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const cleanup = () => {
      request.off('data', data);
      request.off('end', end);
      request.off('error', fail);
      signal.removeEventListener('abort', abort);
    };
    const fail = () => {
      cleanup();
      reject(new Error('Invalid request body.'));
    };
    const abort = () => {
      cleanup();
      reject(new Error('Request canceled.'));
    };
    const data = (chunk: Buffer) => {
      size += chunk.length;
      if (size > 96000) {
        fail();
        request.resume();
        return;
      }
      chunks.push(chunk);
    };
    const end = () => {
      cleanup();
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown);
      } catch {
        reject(new Error('Invalid JSON.'));
      }
    };
    request.on('data', data);
    request.once('end', end);
    request.once('error', fail);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}

export function createGateway(
  service: GroundedService,
  origins: readonly string[],
) {
  if (
    !origins.length ||
    origins.some(
      (origin) =>
        !/^(chrome-extension:\/\/[a-p]{32}|moz-extension:\/\/[a-f0-9-]{36})$/.test(
          origin,
        ),
    )
  ) {
    throw new Error('Set WDIM_EXTENSION_ORIGINS to exact extension origins.');
  }
  let active = 0;
  let attempts: number[] = [];
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const address = server.address();
    if (
      !address ||
      typeof address === 'string' ||
      request.headers.host !== `127.0.0.1:${address.port}` ||
      !request.headers.origin ||
      !origins.includes(request.headers.origin)
    ) {
      response.writeHead(403).end('{"error":"Forbidden"}');
      request.resume();
      return;
    }
    response.setHeader('Access-Control-Allow-Origin', request.headers.origin);
    response.setHeader('Vary', 'Origin');
    if (request.url !== '/v1/answer') {
      response.writeHead(404).end('{"error":"Not found"}');
      request.resume();
      return;
    }
    if (request.method === 'OPTIONS') {
      response.setHeader('Access-Control-Allow-Methods', 'POST');
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      response.writeHead(204).end();
      return;
    }
    if (
      request.method !== 'POST' ||
      request.headers['content-type'] !== 'application/json'
    ) {
      response.writeHead(415).end('{"error":"JSON POST required"}');
      request.resume();
      return;
    }
    const now = Date.now();
    attempts = attempts.filter((time) => now - time < 60000);
    if (active >= 2 || attempts.length >= 10) {
      response.setHeader('Retry-After', '60');
      response.writeHead(429).end('{"error":"Try again later"}');
      request.resume();
      return;
    }
    attempts.push(now);
    active++;
    const controller = new AbortController();
    const abort = () => controller.abort();
    const timer = setTimeout(abort, 40000);
    request.once('aborted', abort);
    request.on('error', abort);
    response.once('close', () => {
      if (!response.writableEnded) abort();
    });
    try {
      const body = await readBody(request, controller.signal);
      const result = await service.answer(body, controller.signal);
      controller.signal.throwIfAborted();
      response.writeHead(200).end(JSON.stringify(result));
    } catch {
      // No provider errors, model prose, prompts, catalog data, or secrets in logs/responses.
      if (!response.destroyed)
        response
          .writeHead(503)
          .end('{"error":"A verified answer is unavailable"}');
    } finally {
      active--;
      clearTimeout(timer);
      request.off('aborted', abort);
    }
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  return server;
}
