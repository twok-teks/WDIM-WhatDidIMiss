import type {
  MediaIdentity,
  PlaybackPosition,
  PlaybackTimeline,
} from '../../domain/media/types';

export interface PlaybackObservation {
  readonly media: MediaIdentity;
  readonly position: PlaybackPosition;
  readonly timeline: PlaybackTimeline;
}

export interface SiteAdapter {
  readonly id: string;
  supports(url: URL): boolean;
  identify(video: HTMLVideoElement, document: Document): MediaIdentity;
  // Verified mapping must address the story timeline, including stitched ads.
  // Replacements/ambiguous continuity must be unknown; an ad flag alone is insufficient.
  readPlayback(
    video: HTMLVideoElement,
    document: Document,
    raw: PlaybackPosition,
  ): PlaybackObservation;
}

export function selectAdapter(
  adapters: readonly SiteAdapter[],
  url: URL,
): SiteAdapter {
  const adapter = adapters.find((candidate) => candidate.supports(url));
  if (!adapter) throw new Error('No adapter supports this page.');
  return adapter;
}
