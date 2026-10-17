import type {
  Caption,
  CaptionEvidence,
  CaptionStatus,
} from '../../domain/spoilers/captions';
import type { PlaybackContext } from '../../domain/media/types';
import { canAsk } from '../../domain/spoilers/playback';
import { readCaptionSurface } from '../adapters/platform-captions';
import { readPastCaptions, type PastCaptions } from '../adapters/past-captions';

interface Session {
  mediaId: string;
  previousTime: number;
  previousText: string;
  captions: Caption[];
  since: number;
  blocked: boolean;
  suppressedText: string;
  history?: PastCaptions;
  tracks: readonly TextTrack[];
  excludedTracks: readonly TextTrack[];
}
export class CaptionCollector {
  private sessions = new WeakMap<HTMLVideoElement, Session>();
  clear() {
    this.sessions = new WeakMap();
  }

  observe(
    video: HTMLVideoElement,
    context: PlaybackContext,
    invalidate: boolean,
  ): CaptionStatus {
    const surface = readCaptionSurface(video, video.ownerDocument);
    const time = context.position.currentTimeSeconds;
    let session = this.sessions.get(video);
    const blocked = surface.blocked || !canAsk(context) || time === null;
    if (
      !session ||
      invalidate ||
      session.mediaId !== context.media.id ||
      (time !== null && time < session.previousTime) ||
      blocked !== session.blocked
    ) {
      const tracks = Array.from(video.textTracks).slice(0, 8);
      const excludedTracks = [
        ...(session?.excludedTracks ?? []),
        ...(session && session.mediaId !== context.media.id
          ? session.tracks
          : []),
      ].filter((track) => tracks.includes(track));
      session = {
        mediaId: context.media.id,
        previousTime: time ?? 0,
        previousText: '',
        suppressedText: session?.previousText || session?.suppressedText || '',
        captions: [],
        since: time ?? 0,
        blocked,
        tracks,
        excludedTracks,
      };
      this.sessions.set(video, session);
    }
    if (!blocked && time !== null) {
      session.previousTime = time;
      // This buffer contains displayed captions only. Timed history is recovered
      // separately after a seek or selected read, and cleared on invalidation.
      if (surface.text !== session.suppressedText) session.suppressedText = '';
      if (
        surface.text &&
        surface.text !== session.suppressedText &&
        surface.text !== session.previousText
      ) {
        session.captions.push(
          Object.freeze({ text: surface.text, observedAt: time }),
        );
        session.captions = session.captions.slice(-64);
        let characters = session.captions.reduce(
          (sum, cue) => sum + cue.text.length,
          0,
        );
        while (characters > 16000 && session.captions.length)
          characters -= session.captions.shift()!.text.length;
      }
      session.previousText = surface.text;
    }
    session.tracks = Array.from(video.textTracks).slice(0, 8);
    const count =
      session.captions.length + (session.history?.captions.length ?? 0);
    const since = Math.min(
      session.captions[0]?.observedAt ?? Infinity,
      session.history?.captions[0]?.observedAt ?? Infinity,
    );
    return Object.freeze({
      platform: surface.platform,
      assetId: surface.assetId,
      count,
      since: blocked ? null : Number.isFinite(since) ? since : session.since,
      state: blocked ? 'blocked' : count ? 'ready' : 'waiting',
      ...(session.history ? { recovery: session.history.state } : {}),
    });
  }

  read(video: HTMLVideoElement, mediaId: string): CaptionEvidence | undefined {
    const session = this.sessions.get(video);
    if (!session || session.mediaId !== mediaId || session.blocked) return;
    return Object.freeze({
      mediaId,
      captions: Object.freeze(this.available(session, session.previousTime)),
    });
  }

  recover(video: HTMLVideoElement, context: PlaybackContext): void {
    const session = this.sessions.get(video);
    if (
      !session ||
      session.mediaId !== context.media.id ||
      session.blocked ||
      !canAsk(context) ||
      context.position.currentTimeSeconds !== video.currentTime
    )
      return;
    session.history = readPastCaptions(
      video,
      video.currentTime,
      session.excludedTracks,
    );
    session.history.captions.sort((a, b) => a.observedAt - b.observedAt);
  }

  private available(session: Session, time: number): Caption[] {
    return [...(session.history?.captions ?? []), ...session.captions]
      .filter((cue) => cue.observedAt <= time)
      .sort((a, b) => a.observedAt - b.observedAt);
  }
}
