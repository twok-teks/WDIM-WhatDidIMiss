import type { MediaIdentity, PlaybackContext } from '../media/types';

const boundaryBrand: unique symbol = Symbol('SpoilerBoundary');
const windowBrand: unique symbol = Symbol('AllowedContextWindow');

export interface SpoilerBoundary {
  readonly [boundaryBrand]: true;
  readonly mediaId: string;
  readonly maximumAllowedTimestamp: number;
  readonly previousMediaAllowed: readonly string[];
}

export interface KnowledgeFragment {
  readonly mediaId: string;
  // The latest reveal needed to understand ALL of this fragment, not its scene start.
  readonly revealedAtSeconds: number;
  readonly text: string;
}

export interface AllowedContextWindow {
  readonly [windowBrand]: true;
  readonly boundary: SpoilerBoundary;
  readonly fragments: readonly KnowledgeFragment[];
}

export function createSpoilerBoundary(
  context: PlaybackContext,
  explicitlyAllowedPredecessors: readonly MediaIdentity[] = [],
): SpoilerBoundary {
  const time = context.position.currentTimeSeconds;
  const duration = context.position.durationSeconds;
  if (
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
    context?.media.id === boundary.mediaId &&
    time !== null &&
    time !== undefined &&
    Number.isFinite(time) &&
    time >= boundary.maximumAllowedTimestamp
  );
}
