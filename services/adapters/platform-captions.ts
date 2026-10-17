import type { Platform } from '../../domain/spoilers/captions';

export interface CaptionSurface {
  platform: Platform;
  assetId: string | null;
  text: string;
  blocked: boolean;
}
const hostIs = (host: string, suffix: string) =>
  host === suffix || host.endsWith(`.${suffix}`);

export function platformIdentity(url: URL): {
  platform: Platform;
  assetId: string | null;
} {
  const host = url.hostname.toLowerCase();
  let platform: Platform = 'generic';
  let id: string | undefined | null;
  if (hostIs(host, 'youtube.com')) {
    platform = 'youtube';
    id =
      url.pathname === '/watch'
        ? url.searchParams.get('v')
        : url.pathname.match(/^\/(?:embed|shorts)\/([\w-]+)/)?.[1];
  } else if (hostIs(host, 'netflix.com')) {
    platform = 'netflix';
    id = url.pathname.match(/^\/watch\/(\d+)/)?.[1];
  } else if (hostIs(host, 'hulu.com')) {
    platform = 'hulu';
    id = url.pathname.match(/^\/watch\/([a-zA-Z0-9-]+)/)?.[1];
  } else if (hostIs(host, 'disneyplus.com')) {
    platform = 'disney';
    id = url.pathname.match(/\/(?:play|video)\/([a-zA-Z0-9-]+)/)?.[1];
  } else if (
    hostIs(host, 'primevideo.com') ||
    [
      'amazon.com',
      'amazon.co.uk',
      'amazon.de',
      'amazon.co.jp',
      'amazon.ca',
      'amazon.com.au',
    ].some((domain) => hostIs(host, domain))
  ) {
    platform = 'prime';
    id = url.pathname.match(/\/(?:detail|video\/detail)\/([a-zA-Z0-9]+)/)?.[1];
  }
  return {
    platform,
    assetId:
      id && /^[a-zA-Z0-9_-]{1,140}$/.test(id) ? `${platform}:${id}` : null,
  };
}

// These narrowly scoped DOM surfaces are best-effort integrations, not public APIs.
// Native displayed TextTracks work on all five platforms when exposed by the player.
const surfaces: Record<
  Platform,
  { root: string; caption: string; ad: string } | null
> = {
  youtube: {
    root: '.html5-video-player',
    caption: '.ytp-caption-window-container .ytp-caption-segment',
    ad: '.ad-showing, .ad-interrupting',
  },
  netflix: {
    root: '.watch-video',
    caption: '.player-timedtext-text-container',
    ad: '[data-uia="ads-info"]',
  },
  prime: {
    root: '.atvwebplayersdk-player-container',
    caption: '.atvwebplayersdk-captions-text',
    ad: '.atvwebplayersdk-adtimeindicator-text',
  },
  disney: {
    root: 'disney-web-player, .btm-media-client, .dss-video-player',
    caption: '.dss-subtitle-renderer-line',
    ad: '[data-testid="ad-countdown"]',
  },
  // Hulu uses native tracks when available. No reliable custom DOM contract yet.
  hulu: null,
  generic: null,
};

function visible(element: Element): boolean {
  if (!element.isConnected || element.getClientRects().length === 0)
    return false;
  for (let node: Element | null = element; node; node = node.parentElement) {
    const style = element.ownerDocument.defaultView?.getComputedStyle(node);
    if (
      style?.display === 'none' ||
      style?.visibility === 'hidden' ||
      style?.opacity === '0' ||
      node.hasAttribute('hidden')
    )
      return false;
  }
  return true;
}

export function readCaptionSurface(
  video: HTMLVideoElement,
  document: Document,
  timingOnly = false,
): CaptionSurface {
  const identity = platformIdentity(new URL(document.location.href));
  const surface = surfaces[identity.platform] ?? {
    root: '.video-js',
    caption: '.vjs-text-track-cue',
    ad: '.vjs-ad-playing',
  };
  const root = surface ? video.closest(surface.root) : null;
  const ad =
    surface &&
    root &&
    (root.matches(surface.ad) ||
      [...root.querySelectorAll(surface.ad)].some(visible));
  if (
    ad ||
    video.seeking ||
    video.readyState < 2 ||
    !Number.isFinite(video.duration) ||
    video.duration <= 0
  )
    return { ...identity, text: '', blocked: true };
  if (timingOnly) return { ...identity, text: '', blocked: false };
  // Read only displayed active cues. Never enable tracks or read the full cues list.
  const texts: string[] = [];
  for (const track of Array.from(video.textTracks).slice(0, 8)) {
    if (
      track.mode !== 'showing' ||
      !['subtitles', 'captions'].includes(track.kind)
    )
      continue;
    for (const cue of Array.from(track.activeCues ?? []).slice(0, 8)) {
      if (
        cue.startTime <= video.currentTime &&
        cue.endTime > video.currentTime &&
        'text' in cue &&
        typeof cue.text === 'string'
      )
        texts.push(cue.text);
    }
  }
  if (
    !texts.length &&
    surface &&
    root &&
    root.querySelectorAll('video').length === 1
  ) {
    for (const element of Array.from(
      root.querySelectorAll(surface.caption),
    ).slice(0, 8)) {
      if (visible(element)) texts.push(element.textContent ?? '');
    }
  }
  // Keep DOM text inert. React renders strings, never HTML; no evaluation or links from captions.
  const text = texts
    .join(' ')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return { ...identity, text: text.length <= 600 ? text : '', blocked: false };
}
