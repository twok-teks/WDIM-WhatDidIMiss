import type {
  Caption,
  CaptionEvidence,
  CaptionStatus,
} from '../../domain/spoilers/captions';
import type { PlaybackContext } from '../../domain/media/types';
import { canAsk } from '../../domain/spoilers/playback';
import { readCaptionSurface } from '../adapters/platform-captions';

interface Session {
  mediaId: string;
  previousTime: number;
  previousText: string;
  captions: Caption[];
  since: number;
  blocked: boolean;
  suppressedText: string;
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
      session = {
        mediaId: context.media.id,
        previousTime: time ?? 0,
        previousText: '',
        suppressedText: session?.previousText || session?.suppressedText || '',
        captions: [],
        since: time ?? 0,
        blocked,
      };
      this.sessions.set(video, session);
    }
    if (!blocked && time !== null) {
      session.previousTime = time;
      // A caption must actually have appeared on screen in this session. A seek to
      // a later position never imports the skipped transcript. Each rewind clears it.
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
    return Object.freeze({
      platform: surface.platform,
      assetId: surface.assetId,
      count: session.captions.length,
      since: blocked
        ? null
        : (session.captions[0]?.observedAt ?? session.since),
      state: blocked
        ? 'blocked'
        : session.captions.length
          ? 'ready'
          : 'waiting',
    });
  }

  read(video: HTMLVideoElement, mediaId: string): CaptionEvidence | undefined {
    const session = this.sessions.get(video);
    if (!session || session.mediaId !== mediaId || session.blocked) return;
    return Object.freeze({
      mediaId,
      captions: Object.freeze(session.captions.slice(-64)),
    });
  }
}
