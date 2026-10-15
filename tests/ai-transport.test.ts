// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  id: 'wdim-test',
  lastError: undefined,
  connect: vi.fn(),
  onConnect: { addListener: vi.fn() },
}));
vi.mock('wxt/browser', () => ({ browser: { runtime } }));

import { BrowserGroundedTransport } from '../services/chat/browser-grounded-transport';
import { installAiGateway } from '../services/chat/background-ai-gateway';
import { AI_PORT } from '../services/chat/browser-grounded-transport';
import { parseGroundedQuery } from '../domain/spoilers/grounding';

function event<T extends (...args: never[]) => void>() {
  const listeners = new Set<T>();
  return {
    addListener: (listener: T) => listeners.add(listener),
    removeListener: (listener: T) => listeners.delete(listener),
    emit: (...args: Parameters<T>) => {
      for (const listener of listeners) listener(...args);
    },
  };
}
function port() {
  const onDisconnect = event<() => void>();
  return {
    name: AI_PORT,
    sender: { id: runtime.id, frameId: 0, tab: { id: 1, incognito: false } },
    onMessage: event<(value: unknown) => void>(),
    onDisconnect,
    postMessage: vi.fn(),
    disconnect: vi.fn(() => onDisconnect.emit()),
  };
}
const query = parseGroundedQuery({
  question: 'Question',
  boundary: {
    mediaId: 'verified',
    maximumAllowedTimestamp: 47,
    timelineMapping: 'verified',
  },
});

beforeEach(() => {
  runtime.connect.mockReset();
  runtime.onConnect.addListener.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe('browser AI transport', () => {
  it('cancels the port and rejects a late response after a playback invalidation', async () => {
    const channel = port();
    runtime.connect.mockReturnValue(channel);
    const controller = new AbortController();
    const pending = new BrowserGroundedTransport().answer(
      query,
      controller.signal,
    );
    const assertion = expect(pending).rejects.toThrow('Canceled');
    controller.abort();
    channel.onMessage.emit({ type: 'answer', result: 'STALE' });
    await assertion;
    expect(channel.disconnect).toHaveBeenCalledOnce();
    expect(channel.postMessage).toHaveBeenCalledWith(query);
  });

  it('fails closed on worker disconnect and never returns an error body as an answer', async () => {
    const channel = port();
    runtime.connect.mockReturnValue(channel);
    const pending = new BrowserGroundedTransport().answer(
      query,
      new AbortController().signal,
    );
    const assertion = expect(pending).rejects.toThrow('disconnected');
    channel.onDisconnect.emit();
    await assertion;
  });
});

describe('authenticated background AI route', () => {
  it.each(['foreign-extension', 'subframe', 'incognito', 'disabled'])(
    'rejects %s without fetching',
    (scenario) => {
      const fetcher = vi.fn();
      vi.stubGlobal('fetch', fetcher);
      installAiGateway(scenario !== 'disabled');
      const channel = port();
      if (scenario === 'foreign-extension') channel.sender.id = 'other';
      if (scenario === 'subframe') channel.sender.frameId = 2;
      if (scenario === 'incognito') channel.sender.tab.incognito = true;
      runtime.onConnect.addListener.mock.calls[0]![0](channel);
      channel.onMessage.emit(query);
      expect(channel.disconnect).toHaveBeenCalled();
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it('uses only the fixed loopback endpoint and aborts fetch when the UI cancels', async () => {
    let signal: AbortSignal | null | undefined;
    const fetcher = vi.fn<typeof fetch>(async (_url, options) => {
      signal = options?.signal;
      return new Promise<Response>((_resolve, reject) =>
        signal?.addEventListener('abort', () => reject(new Error('aborted')), {
          once: true,
        }),
      );
    });
    vi.stubGlobal('fetch', fetcher);
    installAiGateway(true);
    const channel = port();
    runtime.onConnect.addListener.mock.calls[0]![0](channel);
    channel.onMessage.emit(query);
    expect(fetcher.mock.calls[0]?.[0]).toBe('http://127.0.0.1:8787/v1/answer');
    channel.onDisconnect.emit();
    expect(signal?.aborted).toBe(true);
    await Promise.resolve();
    expect(channel.postMessage).not.toHaveBeenCalled();
  });
});
