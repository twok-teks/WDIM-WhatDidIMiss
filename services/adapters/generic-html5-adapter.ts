import { createId } from '../id';
import type { MediaIdentity, PlaybackPosition } from '../../domain/media/types';
import type { SiteAdapter, PlaybackObservation } from './site-adapter';

export class GenericHtml5Adapter implements SiteAdapter {
  constructor(private observedCaptionClock = false) {}
  readonly id = 'generic-html5';
  private timelines = new WeakMap<
    HTMLVideoElement,
    { id: string; duration: number | null; uncertain: boolean }
  >();

  readPlayback(
    video: HTMLVideoElement,
    document: Document,
    raw: PlaybackPosition,
  ): PlaybackObservation {
    const media = this.identify(video, document);
    const previous = this.timelines.get(video);
    const same = previous?.id === media.id;
    // A duration change can be an ad, live timeline, or replacement. Never guess.
    const changed =
      same &&
      previous.duration !== null &&
      raw.durationSeconds !== previous.duration;
    // Caption-only AI never retrieves a full story by this clock. A duration
    // discontinuity can start a NEW unverified session once raw timing is known;
    // it cannot revive old captions, identity, conversations, or verified mapping.
    if (
      this.observedCaptionClock &&
      same &&
      (changed || previous.uncertain) &&
      raw.currentTimeSeconds !== null &&
      raw.durationSeconds !== null &&
      raw.durationSeconds > 0 &&
      raw.currentTimeSeconds <= raw.durationSeconds
    ) {
      this.identities.delete(video);
      this.timelines.delete(video);
      return this.readPlayback(video, document, raw);
    }
    const uncertain = (same && previous.uncertain) || changed;
    this.timelines.set(video, {
      id: media.id,
      duration: raw.durationSeconds,
      uncertain,
    });
    const available = raw.currentTimeSeconds !== null && !uncertain;
    return {
      media,
      position: available
        ? raw
        : { currentTimeSeconds: null, durationSeconds: null },
      timeline: available
        ? {
            phase: 'unclassified',
            mapping: 'unverified',
            continuity: 'established',
          }
        : { phase: 'unknown', mapping: 'unavailable', continuity: 'unknown' },
    };
  }
  private identities = new WeakMap<
    HTMLVideoElement,
    { key: string; id: string }
  >();

  supports(url: URL): boolean {
    return ['https:', 'http:', 'about:', 'blob:', 'data:'].includes(
      url.protocol,
    );
  }

  identify(video: HTMLVideoElement, document: Document): MediaIdentity {
    // Source is ONLY a local change detector, never a movie identifier or transmitted URL.
    const locationKey =
      document.location.protocol === 'data:' ? 'data:' : document.location.href;
    const key = `${locationKey}\n${video.currentSrc || video.src}`;
    let identity = this.identities.get(video);
    if (!identity || identity.key !== key) {
      identity = { key, id: `page-video:${createId()}` };
      this.identities.set(video, identity);
    }
    return Object.freeze({
      id: identity.id,
      title: document.title.trim().slice(0, 160) || 'Untitled video page',
      confidence: 'unverified',
    });
  }
}
