import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlaybackContext } from '../domain/media/types';
import {
  boundaryStillAllowed,
  createSpoilerBoundary,
  filterAllowedKnowledge,
} from '../domain/spoilers/boundary';
import {
  canAsk,
  conversationInvalidated,
  holdAdPosition,
} from '../domain/spoilers/playback';
import type { SiteAdapter } from '../services/adapters/site-adapter';
import { ChatService } from '../services/chat/chat-service';
import { VideoContextProvider } from '../services/video/video-context-provider';
import { playback, videoElement } from './helpers';

afterEach(() => document.body.replaceChildren());

function ad(time: number | null = null): PlaybackContext {
  return {
    ...playback(time),
    timeline: { phase: 'ad', mapping: 'verified', continuity: 'established' },
  };
}

describe('story timeline safety', () => {
  it.each([NaN, Infinity, -1, 91])(
    'fails closed for malformed ad story time %s',
    (time) => {
      const next = holdAdPosition(playback(), ad(time));
      expect(next.timeline.phase).toBe('unknown');
      expect(conversationInvalidated(playback(), next)).toBe(true);
    },
  );
  it('uses mapped story time, never the stitched stream clock', () => {
    const mapped = {
      ...playback(47),
      rawPosition: { currentTimeSeconds: 137, durationSeconds: 180 },
    };
    const boundary = createSpoilerBoundary(mapped);
    expect(boundary.maximumAllowedTimestamp).toBe(47);
    expect(
      filterAllowedKnowledge(boundary, [
        { mediaId: mapped.media.id, revealedAtSeconds: 47, text: 'seen' },
        { mediaId: mapped.media.id, revealedAtSeconds: 48, text: 'future' },
      ]).fragments.map((item) => item.text),
    ).toEqual(['seen']);
  });

  it('does not permit any retrieval using an unverified generic clock', () => {
    const generic: PlaybackContext = {
      ...playback(),
      timeline: {
        phase: 'unclassified',
        mapping: 'unverified',
        continuity: 'established',
      },
    };
    const boundary = createSpoilerBoundary(generic);
    expect(boundary.timelineMapping).toBe('unverified');
    expect(
      filterAllowedKnowledge(boundary, [
        { mediaId: generic.media.id, revealedAtSeconds: 0, text: 'opening' },
      ]).fragments,
    ).toEqual([]);
    expect(boundaryStillAllowed(boundary, playback())).toBe(false);
  });

  it('holds through consecutive ads and preserves only existing safe messages', () => {
    const before = playback(47);
    const boundary = createSpoilerBoundary(before);
    const first = holdAdPosition(before, ad(60));
    const second = holdAdPosition(first, ad(80));
    expect(second.position.currentTimeSeconds).toBe(47);
    expect(canAsk(second)).toBe(false);
    expect(() => createSpoilerBoundary(second)).toThrow();
    expect(boundaryStillAllowed(boundary, second)).toBe(true);
    expect(conversationInvalidated(before, first)).toBe(false);
    expect(conversationInvalidated(second, playback(48))).toBe(false);
  });

  it('fails closed for a preroll, lost continuity, and a changed media session', () => {
    for (const previous of [
      undefined,
      playback(null),
      { ...playback(), media: { ...playback().media, id: 'different' } },
    ]) {
      const next = holdAdPosition(previous, ad());
      expect(next.timeline.phase).toBe('unknown');
      expect(canAsk(next)).toBe(false);
    }
    const next = holdAdPosition(playback(), {
      ...ad(),
      timeline: { ...ad().timeline, continuity: 'unknown' },
    });
    expect(conversationInvalidated(playback(), next)).toBe(true);
  });

  it('invalidates a story rewind during or after an ad, even when raw ad time is advancing', () => {
    const before = playback(47);
    const held = holdAdPosition(before, ad());
    const rewind = holdAdPosition(held, {
      ...ad(12),
      rawPosition: { currentTimeSeconds: 65, durationSeconds: 90 },
    });
    expect(rewind.position.currentTimeSeconds).toBe(12);
    expect(conversationInvalidated(held, rewind)).toBe(true);
    expect(conversationInvalidated(held, playback(12))).toBe(true);
    expect(boundaryStillAllowed(createSpoilerBoundary(before), rewind)).toBe(
      false,
    );
  });

  it.each(['ad', 'unknown'] as const)(
    'blocks provider invocation for %s, regardless of raw timing',
    async (phase) => {
      const answer = vi.fn(async () => 'must not run');
      const context = {
        ...playback(),
        timeline: { ...playback().timeline, phase },
      };
      await expect(
        new ChatService({ answer }).ask(
          'Question',
          context,
          new AbortController().signal,
        ),
      ).rejects.toThrow();
      expect(answer).not.toHaveBeenCalled();
    },
  );
});

describe('collector timeline transitions', () => {
  it('tracks ad transitions separately from conversation invalidation and ignores raw ad resets', () => {
    const video = videoElement(47);
    document.body.append(video);
    let observation = playback(47);
    const adapter: SiteAdapter = {
      id: 'test-mapped-player',
      supports: () => true,
      identify: () => observation.media,
      readPlayback: () => observation,
    };
    const source = new VideoContextProvider(document, [adapter]);
    source.start();
    try {
      const before = source.getReport().videos[0]!;
      observation = ad();
      video.currentTime = 0;
      video.dispatchEvent(new Event('seeking'));
      const during = source.getReport().videos[0]!;
      expect(during.context.position.currentTimeSeconds).toBe(47);
      expect(during.context.rawPosition.currentTimeSeconds).toBe(0);
      expect(during.safetyRevision).toBe(before.safetyRevision);
      expect(during.requestRevision).toBeGreaterThan(before.requestRevision);
      observation = ad(70);
      source.read();
      expect(source.getSnapshot().context?.position.currentTimeSeconds).toBe(
        47,
      );
      observation = playback(48);
      const after = source.read();
      expect(after.safetyRevision).toBe(before.safetyRevision);
      expect(after.requestRevision).toBeGreaterThan(during.requestRevision);
      observation = playback(12);
      expect(source.read().safetyRevision).toBeGreaterThan(
        after.safetyRevision,
      );
    } finally {
      source.stop();
    }
  });

  it('treats unexplained duration changes as uncertainty until a new media session', async () => {
    const video = videoElement(47);
    document.body.append(video);
    const source = new VideoContextProvider(document);
    source.start();
    try {
      const before = source.getSnapshot();
      expect(before.context?.timeline.phase).toBe('unclassified');
      Object.defineProperty(video, 'duration', {
        configurable: true,
        value: 15,
      });
      video.currentTime = 0;
      video.dispatchEvent(new Event('durationchange'));
      expect(source.getSnapshot().context?.timeline.phase).toBe('unknown');
      expect(source.getSnapshot().safetyRevision).toBeGreaterThan(
        before.safetyRevision,
      );
      Object.defineProperty(video, 'duration', {
        configurable: true,
        value: 90,
      });
      video.currentTime = 48;
      await source.rescan();
      expect(canAsk(source.getSnapshot().context)).toBe(false);
      video.src = 'blob:http://localhost/new-session';
      expect(source.read().context?.timeline.phase).toBe('unclassified');
    } finally {
      source.stop();
    }
  });

  it('does not relabel a generic rewind or source replacement as an ad', () => {
    const video = videoElement(47);
    document.body.append(video);
    const source = new VideoContextProvider(document);
    source.start();
    try {
      const before = source.getSnapshot();
      video.currentTime = 0;
      const rewound = source.read();
      expect(rewound.safetyRevision).toBeGreaterThan(before.safetyRevision);
      expect(rewound.context?.timeline.phase).toBe('unclassified');
      video.src = 'blob:http://localhost/replacement';
      const replaced = source.read();
      expect(replaced.safetyRevision).toBeGreaterThan(rewound.safetyRevision);
      expect(replaced.context?.media.id).not.toBe(rewound.context?.media.id);
    } finally {
      source.stop();
    }
  });
});
