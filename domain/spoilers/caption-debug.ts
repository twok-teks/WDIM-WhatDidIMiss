import type { PlaybackContext } from '../media/types';
import { boundaryStillAllowed, createSpoilerBoundary } from './boundary';
import { canAsk } from './playback';
import type { Caption } from './captions';

export function visibleDebugCaptions(
  captured: PlaybackContext | null,
  current: PlaybackContext | null,
): readonly Caption[] | null {
  if (!captured || !canAsk(captured) || !canAsk(current)) return null;
  const boundary = createSpoilerBoundary(captured);
  if (
    !boundaryStillAllowed(boundary, current) ||
    captured.captionEvidence?.mediaId !== captured.media.id
  )
    return null;
  return captured.captionEvidence.captions.filter(
    (cue) =>
      Number.isFinite(cue.observedAt) &&
      cue.observedAt >= 0 &&
      cue.observedAt <= boundary.maximumAllowedTimestamp,
  );
}
