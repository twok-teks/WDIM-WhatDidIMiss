import { describe, expect, it } from 'vitest';
import { formatTimestamp, sanitizePageUrl } from '../domain/media/types';
import {
  boundaryStillAllowed,
  createSpoilerBoundary,
  filterAllowedKnowledge,
} from '../domain/spoilers/boundary';
import { playback } from './helpers';

describe('timestamp and page context', () => {
  it.each([
    [0, '0:00'],
    [47.99, '0:47'],
    [2852, '47:32'],
    [8100, '2:15:00'],
    [null, '—'],
    [NaN, '—'],
    [Infinity, '—'],
    [-1, '—'],
  ] as const)(
    'formats %s without rounding into the future',
    (seconds, expected) => {
      expect(formatTimestamp(seconds)).toBe(expected);
    },
  );
  it('drops credentials, query parameters and fragments from exposed URLs', () => {
    expect(
      sanitizePageUrl(
        'https://name:secret@example.com/watch?token=secret#private',
      ),
    ).toBe('https://example.com/watch');
  });
});

describe('spoiler boundary', () => {
  it('includes the boundary endpoint but excludes any future, foreign, or malformed fact', () => {
    const boundary = createSpoilerBoundary(playback(47));
    const window = filterAllowedKnowledge(boundary, [
      { mediaId: 'movie-3', revealedAtSeconds: 0, text: 'opening' },
      { mediaId: 'movie-3', revealedAtSeconds: 47, text: 'known' },
      { mediaId: 'movie-3', revealedAtSeconds: 47.001, text: 'future' },
      { mediaId: 'movie-4', revealedAtSeconds: 0, text: 'sequel' },
      { mediaId: 'movie-3', revealedAtSeconds: NaN, text: 'unknown' },
      { mediaId: 'movie-3', revealedAtSeconds: -1, text: 'invalid' },
    ]);
    expect(window.fragments.map((fact) => fact.text)).toEqual([
      'opening',
      'known',
    ]);
    expect(Object.isFrozen(window.fragments[0])).toBe(true);
    expect(Object.isFrozen(boundary.previousMediaAllowed)).toBe(true);
  });
  it.each([null, NaN, Infinity, -1, 91])(
    'fails closed for position %s',
    (seconds) => {
      expect(() => createSpoilerBoundary(playback(seconds))).toThrow();
    },
  );
  it('allows a known timestamp when finite duration is unavailable', () => {
    expect(
      createSpoilerBoundary({
        ...playback(),
        position: { currentTimeSeconds: 47, durationSeconds: null },
      }).maximumAllowedTimestamp,
    ).toBe(47);
  });
  it('requires explicit, verified predecessors from the same series in earlier release order', () => {
    const context = {
      ...playback(),
      media: {
        id: 'movie-3',
        title: 'Third',
        confidence: 'verified' as const,
        release: { seriesId: 'series', order: 3 },
      },
    };
    const first = {
      id: 'movie-1',
      title: 'First',
      confidence: 'verified' as const,
      release: { seriesId: 'series', order: 1 },
    };
    const future = {
      ...first,
      id: 'movie-4',
      release: { seriesId: 'series', order: 4 },
    };
    const unrelated = {
      ...first,
      id: 'other',
      release: { seriesId: 'other', order: 1 },
    };
    const unverified = {
      ...first,
      id: 'guess',
      confidence: 'unverified' as const,
    };
    expect(createSpoilerBoundary(context).previousMediaAllowed).toEqual([]);
    const boundary = createSpoilerBoundary(context, [
      first,
      future,
      unrelated,
      unverified,
    ]);
    expect(boundary.previousMediaAllowed).toEqual(['movie-1']);
    expect(
      createSpoilerBoundary(playback(), [first]).previousMediaAllowed,
    ).toEqual([]);
    expect(
      filterAllowedKnowledge(boundary, [
        {
          mediaId: 'movie-1',
          revealedAtSeconds: 5000,
          text: 'previous ending',
        },
      ]).fragments,
    ).toHaveLength(1);
  });
  it('rejects an old answer after rewind, lost video, or media change', () => {
    const boundary = createSpoilerBoundary(playback(47));
    expect(boundaryStillAllowed(boundary, playback(48))).toBe(true);
    expect(boundaryStillAllowed(boundary, playback(12))).toBe(false);
    expect(boundaryStillAllowed(boundary, null)).toBe(false);
    expect(
      boundaryStillAllowed(boundary, {
        ...playback(),
        media: { ...playback().media, id: 'other' },
      }),
    ).toBe(false);
  });
});
