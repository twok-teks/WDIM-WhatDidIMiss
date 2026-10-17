import { afterEach, describe, expect, it, vi } from 'vitest';
import { readPastCaptions } from '../services/adapters/past-captions';
import { CaptionCollector } from '../services/video/caption-collector';
import { VideoContextProvider } from '../services/video/video-context-provider';
import { retrieveCaptions } from '../domain/spoilers/caption-retrieval';
import { playback, videoElement } from './helpers';

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
function fixture() {
  const video = videoElement(47);
  document.body.append(video);
  const futureText = vi.fn(() => {
    throw new Error('Future text was read');
  });
  const crossingText = vi.fn(() => {
    throw new Error('Straddling text was read');
  });
  const cues = [
    { startTime: 0, endTime: 10, text: 'Earlier companion is Tuan.' },
    { startTime: 10, endTime: 47, text: 'Exactly at the boundary.' },
    {
      startTime: 46,
      endTime: 48,
      get text() {
        return crossingText();
      },
    },
    {
      startTime: 70,
      endTime: 80,
      get text() {
        return futureText();
      },
    },
  ];
  const track = { mode: 'showing', kind: 'captions', cues, activeCues: [] };
  Object.defineProperty(video, 'textTracks', {
    configurable: true,
    value: [track],
  });
  return { video, track, cues, futureText, crossingText };
}
describe('past subtitle recovery', () => {
  it('reads only completed cues and never accesses later or straddling cue text', () => {
    const { video, futureText, crossingText } = fixture();
    expect(readPastCaptions(video, 47).captions).toEqual([
      {
        text: 'Earlier companion is Tuan.',
        observedAt: 10,
        origin: 'transcript',
      },
      {
        text: 'Exactly at the boundary.',
        observedAt: 47,
        origin: 'transcript',
      },
    ]);
    expect(futureText).not.toHaveBeenCalled();
    expect(crossingText).not.toHaveBeenCalled();
    expect(video.currentTime).toBe(47);
  });
  it('fails closed on hidden tracks, mismatched clocks and seeks', () => {
    const { video, track } = fixture();
    expect(readPastCaptions(video, 46).state).toBe('unavailable');
    track.mode = 'hidden';
    expect(readPastCaptions(video, 47).captions).toEqual([]);
    expect(track.mode).toBe('hidden');
    track.mode = 'showing';
    Object.defineProperty(video, 'seeking', {
      configurable: true,
      value: true,
    });
    expect(readPastCaptions(video, 47).state).toBe('unavailable');
  });
  it('rebuilds history at a lower boundary and rejects tracks retained across media changes', () => {
    const { video } = fixture();
    const collector = new CaptionCollector();
    collector.observe(video, playback(47), false);
    collector.recover(video, playback(47));
    expect(collector.read(video, playback().media.id)?.captions).toHaveLength(
      2,
    );
    video.currentTime = 12;
    collector.observe(video, playback(12), true);
    collector.recover(video, playback(12));
    expect(collector.read(video, playback().media.id)?.captions).toHaveLength(
      1,
    );
    const changed = {
      ...playback(12),
      media: { ...playback().media, id: 'other-video' },
    };
    collector.observe(video, changed, true);
    collector.recover(video, changed);
    expect(collector.read(video, changed.media.id)?.captions).toEqual([]);
  });
  it('recovers automatically on seeked and keeps all text out of catalogs', () => {
    const { video } = fixture();
    const source = new VideoContextProvider(
      document,
      undefined,
      undefined,
      true,
    );
    source.start();
    try {
      video.dispatchEvent(new Event('seeked'));
      const report = source.getReport();
      expect(report.videos[0]?.context.captionStatus?.recovery).toBe(
        'available',
      );
      expect(JSON.stringify(report)).not.toContain('Tuan');
      expect(
        source.readVideo(report.videos[0]!.id)?.context.captionEvidence
          ?.captions,
      ).toHaveLength(2);
    } finally {
      source.stop();
    }
  });
  it('marks bounded recovery partial instead of claiming the whole transcript', () => {
    const { video, track } = fixture();
    track.cues = Array.from({ length: 6001 }, () => ({
      startTime: 0,
      endTime: 1,
      text: 'x',
    }));
    const result = readPastCaptions(video, 47);
    expect(result.state).toBe('partial');
    expect(result.captions).toHaveLength(6000);
  });
  it('retrieves old relevant evidence before recent filler and excludes future facts first', () => {
    const captions = Array.from({ length: 100 }, (_, index) => ({
      text:
        index === 0 ? 'Khoai is traveling with Tuan.' : 'Unrelated scenery.',
      observedAt: index,
    }));
    captions.push({ text: 'Khoai FUTURE_SECRET', observedAt: 101 });
    const selected = retrieveCaptions(
      'Who is Khoai traveling with?',
      captions,
      100,
    );
    expect(selected[0]?.text).toContain('Tuan');
    expect(selected).toHaveLength(64);
    expect(JSON.stringify(selected)).not.toContain('FUTURE_SECRET');
  });
  it('keeps accented name evidence when the question omits accents', () => {
    const captions = [
      { text: 'Nguyễn Văn An is our guest.', observedAt: 1 },
      ...Array.from({ length: 100 }, (_, index) => ({
        text: 'Scenery.',
        observedAt: index + 2,
      })),
    ];
    expect(
      retrieveCaptions('Who is Nguyen Van An?', captions, 105)[0]?.text,
    ).toContain('Nguyễn Văn An');
  });
});
