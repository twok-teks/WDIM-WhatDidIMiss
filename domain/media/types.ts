export interface ReleasePosition {
  readonly seriesId: string;
  readonly order: number;
}

export interface MediaIdentity {
  readonly id: string;
  readonly title: string;
  readonly confidence: 'unverified' | 'verified';
  readonly release?: ReleasePosition;
}

export interface PlaybackPosition {
  readonly currentTimeSeconds: number | null;
  readonly durationSeconds: number | null;
}

export type PlaybackState = 'loading' | 'playing' | 'paused' | 'ended';

export interface PlaybackContext {
  readonly media: MediaIdentity;
  readonly position: PlaybackPosition;
  readonly state: PlaybackState;
  readonly pageTitle: string;
  readonly pageUrl: string;
}

export function formatTimestamp(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '—';
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = String(total % 60).padStart(2, '0');
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${remainder}`
    : `${minutes}:${remainder}`;
}

export function sanitizePageUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol === 'about:') return `about:${url.pathname}`;
  if (!['https:', 'http:'].includes(url.protocol)) return url.protocol;
  return `${url.origin}${url.pathname}`;
}
