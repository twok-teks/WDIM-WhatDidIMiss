import type { MediaIdentity } from '../../domain/media/types';

export interface SiteAdapter {
  readonly id: string;
  supports(url: URL): boolean;
  identify(video: HTMLVideoElement, document: Document): MediaIdentity;
}

export function selectAdapter(
  adapters: readonly SiteAdapter[],
  url: URL,
): SiteAdapter {
  const adapter = adapters.find((candidate) => candidate.supports(url));
  if (!adapter) throw new Error('No adapter supports this page.');
  return adapter;
}
