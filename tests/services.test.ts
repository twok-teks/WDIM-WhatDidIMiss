import { describe, expect, it, vi } from 'vitest';
import { ChatService, type AIProvider } from '../services/chat/chat-service';
import { MockAIProvider } from '../services/chat/mock-ai-provider';
import { createPreferenceStorage } from '../storage/preferences';
import { GenericHtml5Adapter } from '../services/adapters/generic-html5-adapter';
import { selectAdapter } from '../services/adapters/site-adapter';
import { playback, videoElement } from './helpers';

describe('ChatService', () => {
  it('delivers an immutable, bounded snapshot with no unrestricted knowledge or history', async () => {
    const answer = vi.fn<AIProvider['answer']>(async () => 'safe mock');
    const service = new ChatService({ answer });
    await service.ask(
      ' What happened? ',
      playback(47),
      new AbortController().signal,
    );
    const request = answer.mock.calls[0]![0];
    expect(request.question).toBe('What happened?');
    expect(request.boundary.maximumAllowedTimestamp).toBe(47);
    expect(request.allowedContext.boundary).toBe(request.boundary);
    expect(request.allowedContext.fragments).toEqual([]);
    expect(request).not.toHaveProperty('history');
    expect(Object.isFrozen(request.playback.position)).toBe(true);
  });
  it('does not invoke a provider for unknown timing or empty questions', async () => {
    const answer = vi.fn();
    const service = new ChatService({ answer });
    await expect(
      service.ask('question', playback(null), new AbortController().signal),
    ).rejects.toThrow();
    await expect(
      service.ask('  ', playback(), new AbortController().signal),
    ).rejects.toThrow();
    expect(answer).not.toHaveBeenCalled();
  });
  it('supports cancellation and mock failure for local error-state testing', async () => {
    const provider = new MockAIProvider({ delayMs: 1, failNext: true });
    const service = new ChatService(provider);
    await expect(
      service.ask('question', playback(), new AbortController().signal),
    ).rejects.toThrow('Simulated');
    await expect(
      service.ask('question', playback(), new AbortController().signal),
    ).resolves.toMatchObject({ text: expect.stringContaining('0:47') });
    const controller = new AbortController();
    const pending = new ChatService(new MockAIProvider()).ask(
      'question',
      playback(),
      controller.signal,
    );
    controller.abort();
    await expect(pending).rejects.toThrow();
  });
});

describe('adapter selection and provisional identity', () => {
  it('selects the first supporting adapter, allowing site-specific adapters before the generic fallback', () => {
    const generic = new GenericHtml5Adapter();
    const site = {
      id: 'future-site',
      supports: () => false,
      identify: generic.identify,
      readPlayback: generic.readPlayback,
    };
    expect(selectAdapter([site, generic], new URL('https://example.com'))).toBe(
      generic,
    );
    expect(() => selectAdapter([generic], new URL('file:///video'))).toThrow();
  });
  it('does not treat a source URL as movie identity, but notices source replacement', () => {
    const adapter = new GenericHtml5Adapter();
    const video = videoElement();
    video.src = 'blob:http://localhost/private';
    const before = adapter.identify(video, document);
    expect(before.confidence).toBe('unverified');
    expect(before.id).not.toContain('blob');
    expect(adapter.identify(video, document).id).toBe(before.id);
    video.src = 'blob:http://localhost/another';
    expect(adapter.identify(video, document).id).not.toBe(before.id);
  });
});

describe('theme preference storage', () => {
  it.each([undefined, 'unexpected', 'dark'])(
    'defaults %s to dark',
    async (theme) => {
      const storage = createPreferenceStorage({
        get: async () => ({ theme }),
        set: async () => {},
      });
      expect(await storage.getTheme()).toBe('dark');
    },
  );
  it('reads and writes only the theme preference', async () => {
    const set = vi.fn(async () => {});
    const storage = createPreferenceStorage({
      get: async () => ({ theme: 'light' }),
      set,
    });
    expect(await storage.getTheme()).toBe('light');
    await storage.setTheme('dark');
    expect(set).toHaveBeenCalledWith({ theme: 'dark' });
  });
});
