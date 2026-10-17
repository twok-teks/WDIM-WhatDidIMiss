import type { Caption } from '../../domain/spoilers/captions';
import { readCaptionSurface } from './platform-captions';

export interface PastCaptions {
  captions: Caption[];
  state: 'available' | 'partial' | 'unavailable';
}

// Only browser-exposed subtitle tracks: no page-world API, transcript scraping,
// cookies, network fetching, or changes to the player's caption settings.
export function readPastCaptions(
  video: HTMLVideoElement,
  boundary: number,
  excludedTracks: readonly TextTrack[] = [],
): PastCaptions {
  const unavailable: PastCaptions = { captions: [], state: 'unavailable' };
  if (
    !Number.isFinite(boundary) ||
    boundary < 0 ||
    video.currentTime !== boundary ||
    readCaptionSurface(video, video.ownerDocument, true).blocked
  )
    return unavailable;
  try {
    const tracks = Array.from(video.textTracks).filter(
      (track) =>
        track.mode === 'showing' &&
        ['captions', 'subtitles'].includes(track.kind),
    );
    // Do not combine languages or an unrelated second track.
    if (
      tracks.length !== 1 ||
      excludedTracks.includes(tracks[0]!) ||
      !tracks[0]!.cues
    )
      return unavailable;
    const cues = tracks[0]!.cues!;
    const captions: Caption[] = [];
    let size = 0;
    let partial = cues.length > 10000;
    for (let index = 0; index < Math.min(cues.length, 10000); index++) {
      const cue = cues[index]!;
      // Inspect timing BEFORE text. A cue that straddles the boundary is not
      // recovered; its last words could reveal something not reached yet.
      if (
        !Number.isFinite(cue.startTime) ||
        !Number.isFinite(cue.endTime) ||
        cue.startTime < 0 ||
        cue.endTime <= cue.startTime
      ) {
        partial = true;
        continue;
      }
      if (cue.endTime > boundary) continue;
      if (!('text' in cue) || typeof cue.text !== 'string') {
        partial = true;
        continue;
      }
      const text = cue.text
        .replace(/<[^>]*>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!text) continue;
      if (text.length > 600) {
        partial = true;
        continue;
      }
      if (captions.length >= 6000 || size + text.length > 256000) {
        partial = true;
        break;
      }
      size += text.length;
      captions.push(
        Object.freeze({ text, observedAt: cue.endTime, origin: 'transcript' }),
      );
    }
    return { captions, state: partial ? 'partial' : 'available' };
  } catch {
    return unavailable;
  }
}
