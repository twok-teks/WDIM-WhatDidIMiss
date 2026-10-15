import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  platformIdentity,
  readCaptionSurface,
} from '../services/adapters/platform-captions';
import { CaptionCollector } from '../services/video/caption-collector';
import * as readers from '../services/adapters/platform-captions';
import { VideoContextProvider } from '../services/video/video-context-provider';
import { parseCaptionQuery, captionQuery } from '../domain/spoilers/captions';
import { validateCaptionResult } from '../domain/spoilers/caption-result';
import { playback, videoElement } from './helpers';

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
function track(video: HTMLVideoElement, text = 'Mira holds an envelope.') {
  const cue = { text, startTime: 0, endTime: 60 };
  const futureRead = vi.fn(() => {
    throw new Error('Future transcript read');
  });
  const current = {
    mode: 'showing',
    kind: 'captions',
    activeCues: [cue],
    get cues() {
      return futureRead();
    },
  };
  Object.defineProperty(video, 'textTracks', {
    configurable: true,
    value: [current],
  });
  return { cue, current, futureRead };
}
const raw = (time = 12) => ({
  ...playback(time),
  media: { ...playback().media, confidence: 'unverified' as const },
  timeline: {
    phase: 'unclassified' as const,
    mapping: 'unverified' as const,
    continuity: 'established' as const,
  },
});
describe('caption observation and platform capabilities', () => {
  it('starts a new unverified caption session after a duration change without reviving old evidence', () => {
    const video = videoElement();
    document.body.append(video);
    const { cue } = track(video);
    const source = new VideoContextProvider(
      document,
      undefined,
      undefined,
      true,
    );
    source.start();
    try {
      const original = source.getReport().videos[0]!;
      expect(original.context.captionStatus?.count).toBe(1);
      Object.defineProperty(video, 'duration', {
        configurable: true,
        value: 120,
      });
      video.dispatchEvent(new Event('durationchange'));
      const next = source.readVideo(original.id)!;
      expect(next.context.media.id).not.toBe(original.context.media.id);
      expect(next.context.media.confidence).toBe('unverified');
      expect(next.context.timeline.mapping).toBe('unverified');
      expect(next.context.captionStatus?.count).toBe(0);
      expect(next.safetyRevision).toBeGreaterThan(original.safetyRevision);
      cue.text = 'New session caption';
      video.dispatchEvent(new Event('timeupdate'));
      const fresh = source.readVideo(original.id)!;
      expect(
        fresh.context.captionEvidence?.captions.map((item) => item.text),
      ).toEqual(['New session caption']);
    } finally {
      source.stop();
    }
  });
  it('bounds retained caption text and reports the oldest retained observation', () => {
    const video = videoElement();
    document.body.append(video);
    const { cue } = track(video);
    const collector = new CaptionCollector();
    for (let time = 1; time < 59; time++) {
      video.currentTime = time;
      cue.text = `${time} ${'x'.repeat(550)}`;
      collector.observe(video, raw(time), false);
    }
    const evidence = collector.read(video, raw().media.id)!;
    expect(evidence.captions.length).toBeLessThanOrEqual(64);
    expect(
      evidence.captions.reduce((sum, caption) => sum + caption.text.length, 0),
    ).toBeLessThanOrEqual(16000);
    expect(collector.observe(video, raw(58), false).since).toBe(
      evidence.captions[0]?.observedAt,
    );
  });
  it.each([
    [
      'https://www.youtube.com/watch?v=abc',
      'html5-video-player',
      '<div class="ytp-caption-window-container"><span class="ytp-caption-segment">Visible caption</span></div>',
    ],
    [
      'https://www.netflix.com/watch/123',
      'watch-video',
      '<div class="player-timedtext-text-container">Visible caption</div>',
    ],
    [
      'https://www.primevideo.com/detail/B123',
      'atvwebplayersdk-player-container',
      '<div class="atvwebplayersdk-captions-text">Visible caption</div>',
    ],
    [
      'https://www.disneyplus.com/play/abc',
      'btm-media-client',
      '<span class="dss-subtitle-renderer-line">Visible caption</span>',
    ],
    [
      'https://www.hulu.com/watch/abc',
      'video-js',
      '<div class="vjs-text-track-cue">Visible caption</div>',
    ],
    [
      'https://third-party.example/player',
      'video-js',
      '<div class="vjs-text-track-cue">Visible caption</div>',
    ],
  ])(
    'reads only the selected player caption surface on %s',
    (url, rootClass, html) => {
      const root = document.createElement('div');
      root.className = rootClass;
      root.innerHTML = html;
      const video = videoElement();
      root.append(video);
      document.body.append(root);
      vi.spyOn(Element.prototype, 'getClientRects').mockReturnValue([
        new DOMRect(0, 0, 100, 20),
      ] as unknown as DOMRectList);
      const location = { location: { href: url } } as Document;
      expect(readCaptionSurface(video, location).text).toBe('Visible caption');
      root.style.opacity = '0';
      expect(readCaptionSurface(video, location).text).toBe('');
      root.style.opacity = '1';
      root.append(videoElement());
      expect(readCaptionSurface(video, location).text).toBe('');
    },
  );
  it('suppresses stale DOM text across a rewind until the caption changes', () => {
    const video = videoElement(70);
    document.body.append(video);
    let text = 'FUTURE_SECRET';
    let blocked = false;
    vi.spyOn(readers, 'readCaptionSurface').mockImplementation(() => ({
      platform: 'youtube',
      assetId: 'youtube:abc',
      text,
      blocked,
    }));
    const collector = new CaptionCollector();
    expect(collector.observe(video, raw(70), false).count).toBe(1);
    blocked = true;
    expect(collector.observe(video, raw(5), true).count).toBe(0);
    blocked = false;
    expect(collector.observe(video, raw(5), false).count).toBe(0);
    expect(collector.read(video, raw().media.id)?.captions).toEqual([]);
    text = 'Earlier safe caption';
    expect(collector.observe(video, raw(6), false).count).toBe(1);
    expect(JSON.stringify(collector.read(video, raw().media.id))).not.toContain(
      'FUTURE_SECRET',
    );
  });
  it('blocks captions during an observed YouTube ad without touching playback', () => {
    const root = document.createElement('div');
    root.className = 'html5-video-player ad-showing';
    const video = videoElement();
    root.append(video);
    document.body.append(root);
    track(video);
    expect(
      readCaptionSurface(video, {
        location: { href: 'https://www.youtube.com/watch?v=abc' },
      } as Document).blocked,
    ).toBe(true);
    expect(video.currentTime).toBe(12);
  });
  it.each([
    ['https://www.youtube.com/watch?v=abc123', 'youtube', 'youtube:abc123'],
    ['https://www.netflix.com/watch/123', 'netflix', 'netflix:123'],
    ['https://www.hulu.com/watch/abc-def', 'hulu', 'hulu:abc-def'],
    ['https://www.disneyplus.com/play/abc-def', 'disney', 'disney:abc-def'],
    ['https://www.primevideo.com/detail/B123', 'prime', 'prime:B123'],
    ['https://www.amazon.com/gp/video/detail/B123', 'prime', 'prime:B123'],
    ['https://youtube.com.attacker.example/watch?v=secret', 'generic', null],
    ['https://third-party.example/player', 'generic', null],
  ])('matches exact platform boundaries for %s', (url, platform, assetId) => {
    expect(platformIdentity(new URL(url))).toEqual({ platform, assetId });
  });
  it('reads displayed active cues only, leaves caption settings and playback untouched', () => {
    const video = videoElement();
    document.body.append(video);
    const { futureRead, current } = track(video);
    expect(readCaptionSurface(video, document).text).toBe(
      'Mira holds an envelope.',
    );
    expect(futureRead).not.toHaveBeenCalled();
    expect(video.currentTime).toBe(12);
    current.mode = 'hidden';
    expect(readCaptionSurface(video, document).text).toBe('');
    expect(current.mode).toBe('hidden');
  });
  it('never imports skipped/future cues and clears observations after a rewind', () => {
    const video = videoElement();
    document.body.append(video);
    const { cue } = track(video);
    const collector = new CaptionCollector();
    expect(collector.observe(video, raw(), false).count).toBe(1);
    cue.text = 'FUTURE_SECRET';
    cue.startTime = 70;
    cue.endTime = 90;
    expect(collector.observe(video, raw(13), false).count).toBe(1);
    video.currentTime = 5;
    expect(collector.observe(video, raw(5), true).count).toBe(0);
    expect(collector.read(video, raw().media.id)?.captions).toEqual([]);
  });
  it('keeps caption text out of periodic catalogs and attaches it only to a fresh selected read', () => {
    const video = videoElement();
    document.body.append(video);
    track(video);
    const source = new VideoContextProvider(
      document,
      undefined,
      undefined,
      true,
    );
    source.start();
    try {
      const report = source.getReport();
      expect(report.videos[0]?.context.captionStatus?.count).toBe(1);
      expect(JSON.stringify(report)).not.toContain('Mira');
      expect(
        source.readVideo(report.videos[0]!.id)?.context.captionEvidence
          ?.captions[0]?.text,
      ).toContain('Mira');
      expect(JSON.stringify(source.getReport())).not.toContain('Mira');
    } finally {
      source.stop();
    }
  });
  it('refuses mismatched sessions, missing clocks, future evidence and invented model captions', () => {
    const context = {
      ...raw(),
      captionStatus: {
        platform: 'generic' as const,
        assetId: null,
        count: 1,
        since: 0,
        state: 'ready' as const,
      },
      captionEvidence: {
        mediaId: raw().media.id,
        captions: [
          { text: 'Known.', observedAt: 10 },
          { text: 'FUTURE_SECRET', observedAt: 70 },
        ],
      },
    };
    const query = captionQuery('What happened?', context, {
      background: false,
      earlierWorks: false,
    })!;
    expect(query.captions).toHaveLength(1);
    expect(
      captionQuery(
        'Q',
        {
          ...context,
          captionEvidence: { ...context.captionEvidence, mediaId: 'foreign' },
        },
        query.options,
      ),
    ).toBeNull();
    expect(() =>
      parseCaptionQuery({
        ...query,
        captions: [{ text: 'Future', observedAt: 70 }],
      }),
    ).toThrow();
    expect(() =>
      validateCaptionResult(
        {
          status: 'answer',
          facts: [
            {
              mediaId: context.media.id,
              text: 'Invented',
              revealedAtSeconds: 10,
              source: { kind: 'caption', label: 'Caption' },
            },
          ],
        },
        query,
      ),
    ).toThrow();
  });
});
