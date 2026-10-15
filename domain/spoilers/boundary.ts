import type { MediaIdentity, PlaybackContext } from '../media/types';
import { canAsk, hasPlaybackContext } from './playback';

const boundaryBrand: unique symbol = Symbol('SpoilerBoundary');
const windowBrand: unique symbol = Symbol('AllowedContextWindow');

export interface SpoilerBoundary {
  readonly [boundaryBrand]: true;
  readonly mediaId: string;
  readonly maximumAllowedTimestamp: number;
  readonly timelineMapping: 'verified' | 'unverified';
  readonly previousMediaAllowed: readonly string[];
}

export interface KnowledgeFragment {
  readonly mediaId: string;
  // The latest reveal needed to understand ALL of this fragment, not its scene start.
  readonly revealedAtSeconds: number;
  readonly text: string;
  readonly source?: {
    readonly kind: 'caption' | 'background' | 'earlier-work';
    readonly label: string;
    readonly url?: string;
  };
}

export interface AllowedContextWindow {
  readonly scope?: 'observed-captions';
  readonly [windowBrand]: true;
  readonly boundary: SpoilerBoundary;
  readonly fragments: readonly KnowledgeFragment[];
}

// An observed-caption window is deliberately separate from verified story retrieval.
// Callers supply only observations from the current playback session and approved
// related facts. It never makes an unverified movie eligible for catalog retrieval.
export function createObservedWindow(
  boundary: SpoilerBoundary,
  facts: readonly KnowledgeFragment[],
): AllowedContextWindow {
  const permitted = facts.filter(
    (fact) =>
      fact.mediaId === boundary.mediaId &&
      !!fact.source &&
      Number.isFinite(fact.revealedAtSeconds) &&
      fact.revealedAtSeconds >= 0 &&
      fact.revealedAtSeconds <= boundary.maximumAllowedTimestamp,
  );
  return Object.freeze({
    [windowBrand]: true as const,
    scope: 'observed-captions' as const,
    boundary,
    fragments: Object.freeze(
      permitted.map((fact) =>
        Object.freeze({ ...fact, source: Object.freeze({ ...fact.source! }) }),
      ),
    ),
  });
}

export function createSpoilerBoundary(
  context: PlaybackContext,
  explicitlyAllowedPredecessors: readonly MediaIdentity[] = [],
): SpoilerBoundary {
  const time = context.position.currentTimeSeconds;
  const duration = context.position.durationSeconds;
  if (
    !canAsk(context) ||
    !context.media.id ||
    time === null ||
    !Number.isFinite(time) ||
    time < 0 ||
    (duration !== null &&
      (!Number.isFinite(duration) || duration < 0 || time > duration))
  ) {
    throw new Error('A known, valid playback position is required.');
  }
  const current = context.media;
  const predecessors = explicitlyAllowedPredecessors.filter(
    (media) =>
      current.confidence === 'verified' &&
      media.confidence === 'verified' &&
      current.release &&
      media.release &&
      media.id !== current.id &&
      current.release.seriesId === media.release.seriesId &&
      Number.isFinite(current.release.order) &&
      Number.isFinite(media.release.order) &&
      media.release.order < current.release.order,
  );
  return Object.freeze({
    [boundaryBrand]: true as const,
    mediaId: current.id,
    maximumAllowedTimestamp: time,
    timelineMapping:
      context.timeline.mapping === 'verified' ? 'verified' : 'unverified',
    previousMediaAllowed: Object.freeze([
      ...new Set(predecessors.map((item) => item.id)),
    ]),
  });
}

export function filterAllowedKnowledge(
  boundary: SpoilerBoundary,
  candidates: readonly KnowledgeFragment[],
): AllowedContextWindow {
  const fragments = candidates.filter((item) => {
    // Generic player time is for the empty local mock only, never story retrieval.
    if (boundary.timelineMapping !== 'verified') return false;
    if (!Number.isFinite(item.revealedAtSeconds) || item.revealedAtSeconds < 0)
      return false;
    return item.mediaId === boundary.mediaId
      ? item.revealedAtSeconds <= boundary.maximumAllowedTimestamp
      : boundary.previousMediaAllowed.includes(item.mediaId);
  });
  return Object.freeze({
    [windowBrand]: true as const,
    boundary,
    fragments: Object.freeze(
      fragments.map((item) => Object.freeze({ ...item })),
    ),
  });
}

export function boundaryStillAllowed(
  boundary: SpoilerBoundary,
  context: PlaybackContext | null,
): boolean {
  const time = context?.position.currentTimeSeconds;
  return (
    hasPlaybackContext(context) &&
    context.timeline.mapping === boundary.timelineMapping &&
    context?.media.id === boundary.mediaId &&
    time !== null &&
    time !== undefined &&
    Number.isFinite(time) &&
    time >= boundary.maximumAllowedTimestamp
  );
}
