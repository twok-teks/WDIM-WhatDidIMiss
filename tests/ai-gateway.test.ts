// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { request as httpRequest, type Server } from 'node:http';
import { createGateway } from '../server/http';
import { GroundedService } from '../server/grounded-service';
import { parseCatalog } from '../server/catalog';

const origin = `chrome-extension://${'a'.repeat(32)}`;
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
});

async function setup() {
  const select = vi.fn(async () => ({ status: 'answer', factIds: ['f0'] }));
  const catalog = parseCatalog({
    version: 1,
    assets: [
      {
        mediaId: 'test',
        durationSeconds: 90,
        facts: [
          { mediaId: 'test', revealedAtSeconds: 10, text: 'Known fact.' },
          { mediaId: 'test', revealedAtSeconds: 60, text: 'FUTURE_SECRET.' },
        ],
      },
    ],
  });
  const server = createGateway(new GroundedService(catalog, { select }), [
    origin,
  ]);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Server did not listen.');
  const url = `http://127.0.0.1:${address.port}/v1/answer`;
  const body = JSON.stringify({
    question: 'What happened?',
    boundary: {
      mediaId: 'test',
      maximumAllowedTimestamp: 47,
      timelineMapping: 'verified',
    },
  });
  return { select, url, body };
}

describe('loopback AI gateway', () => {
  it('serves only validated selected evidence and uses no-store', async () => {
    const { url, body, select } = await setup();
    const response = await fetch(url, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('access-control-allow-origin')).toBe(origin);
    expect(await response.json()).toEqual({
      status: 'answer',
      facts: [{ mediaId: 'test', revealedAtSeconds: 10, text: 'Known fact.' }],
    });
    expect(JSON.stringify(select.mock.calls)).not.toContain('FUTURE_SECRET');
  });

  it.each([undefined, 'https://hostile.example', 'null'])(
    'rejects an unapproved Origin %s before invoking AI',
    async (candidate) => {
      const { url, body, select } = await setup();
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(candidate ? { Origin: candidate } : {}),
        },
        body,
      });
      expect(response.status).toBe(403);
      expect(select).not.toHaveBeenCalled();
    },
  );

  it('rejects a forged Host and does not expose wildcard CORS', async () => {
    const { url, body, select } = await setup();
    const response = await new Promise<{
      status: number | undefined;
      cors: unknown;
    }>((resolve, reject) => {
      const request = httpRequest(
        url,
        {
          method: 'POST',
          headers: {
            Origin: origin,
            Host: 'hostile.example',
            'Content-Type': 'application/json',
          },
        },
        (incoming) => {
          incoming.resume();
          resolve({
            status: incoming.statusCode,
            cors: incoming.headers['access-control-allow-origin'],
          });
        },
      );
      request.on('error', reject);
      request.end(body);
    });
    expect(response.status).toBe(403);
    expect(response.cors).toBeUndefined();
    expect(select).not.toHaveBeenCalled();
  });

  it('rejects injected history and oversized bodies without model calls', async () => {
    const { url, body, select } = await setup();
    for (const payload of [
      JSON.stringify({ ...JSON.parse(body), history: ['future plot'] }),
      'x'.repeat(13000),
    ]) {
      const response = await fetch(url, {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: payload,
      });
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain('future plot');
    }
    expect(select).not.toHaveBeenCalled();
  });

  it('rate limits the local gateway without storing questions', async () => {
    const { url, body } = await setup();
    let status = 0;
    for (let index = 0; index < 11; index++) {
      const response = await fetch(url, {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        body,
      });
      status = response.status;
      await response.text();
    }
    expect(status).toBe(429);
  });

  it('rejects unsafe catalog annotations at load time', () => {
    expect(() =>
      parseCatalog({
        version: 1,
        assets: [
          {
            mediaId: 'test',
            durationSeconds: 90,
            facts: [
              { mediaId: 'other', revealedAtSeconds: 10, text: 'foreign' },
            ],
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      parseCatalog({
        version: 1,
        assets: [
          {
            mediaId: 'test',
            durationSeconds: 90,
            facts: [
              { mediaId: 'test', revealedAtSeconds: 91, text: 'invalid' },
            ],
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      createGateway(new GroundedService([], { select: vi.fn() }), ['*']),
    ).toThrow();
  });
});
