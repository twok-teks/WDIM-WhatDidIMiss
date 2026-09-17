import { createId } from '../id';
import type { MediaIdentity } from '../../domain/media/types';
import type { SiteAdapter } from './site-adapter';

export class GenericHtml5Adapter implements SiteAdapter {
  readonly id = 'generic-html5';
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
