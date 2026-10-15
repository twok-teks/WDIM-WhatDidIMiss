import type { PlaybackContext, PlaybackPosition } from '../media/types';

export function validPosition(position: PlaybackPosition): boolean {
  const time = position.currentTimeSeconds;
  const duration = position.durationSeconds;
  return (
    time !== null &&
    Number.isFinite(time) &&
    time >= 0 &&
    (duration === null || (Number.isFinite(duration) && duration >= time))
  );
}

export function hasPlaybackContext(
  context: PlaybackContext | null,
): context is PlaybackContext {
  return (
    !!context?.media.id &&
    context.captionStatus?.state !== 'blocked' &&
    context.timeline.continuity === 'established' &&
    validPosition(context.position) &&
    ((context.timeline.mapping === 'verified' &&
      ['content', 'ad'].includes(context.timeline.phase)) ||
      (context.timeline.mapping === 'unverified' &&
        context.timeline.phase === 'unclassified'))
  );
}

export function canAsk(context: PlaybackContext | null): boolean {
  return (
    hasPlaybackContext(context) &&
    context.timeline.phase !== 'ad' &&
    context.state !== 'loading'
  );
}

// Only a continuously observed, mapped content session may survive an ad break.
// An adapter's ad clock must never advance the held story position.
export function holdAdPosition(
  previous: PlaybackContext | undefined,
  next: PlaybackContext,
): PlaybackContext {
  if (next.timeline.phase !== 'ad') return next;
  if (
    !previous ||
    !hasPlaybackContext(previous) ||
    previous.timeline.mapping !== 'verified' ||
    previous.media.id !== next.media.id ||
    next.timeline.mapping !== 'verified' ||
    next.timeline.continuity !== 'established' ||
    (next.position.currentTimeSeconds !== null && !validPosition(next.position))
  ) {
    return {
      ...next,
      position: { currentTimeSeconds: null, durationSeconds: null },
      timeline: {
        phase: 'unknown',
        mapping: 'unavailable',
        continuity: 'unknown',
      },
    };
  }
  const reported = next.position.currentTimeSeconds;
  const held = previous.position.currentTimeSeconds!;
  // A reported story rewind remains a rewind, including during consecutive ads.
  const time = reported === null ? held : Math.min(held, reported);
  return {
    ...next,
    position: { ...previous.position, currentTimeSeconds: time },
  };
}

export function conversationInvalidated(
  previous: PlaybackContext | null | undefined,
  next: PlaybackContext | null,
): boolean {
  if (previous?.media.id !== next?.media.id) return true;
  if (!previous || !next) return false;
  if (
    previous.timeline.mapping !== next.timeline.mapping ||
    previous.timeline.continuity !== next.timeline.continuity
  )
    return true;
  if (hasPlaybackContext(previous) && !hasPlaybackContext(next)) return true;
  const before = previous.position.currentTimeSeconds;
  const after = next.position.currentTimeSeconds;
  return before !== null && (after === null || after < before);
}

export function requestInvalidated(
  previous: PlaybackContext | null | undefined,
  next: PlaybackContext | null,
): boolean {
  return (
    conversationInvalidated(previous, next) ||
    previous?.timeline.phase !== next?.timeline.phase ||
    (!!previous && canAsk(previous) !== canAsk(next))
  );
}
