import { createId } from '../id';
import type { PlaybackContext } from '../../domain/media/types';
import { sanitizePageUrl } from '../../domain/media/types';
import { GenericHtml5Adapter } from '../adapters/generic-html5-adapter';
import { selectAdapter, type SiteAdapter } from '../adapters/site-adapter';
import { selectActiveVideo } from './video-detector';
import {
  discoverVideos,
  isComposedDescendant,
  isPictureInPicture,
  videoVisibility,
  type ShadowRootReader,
} from './video-discovery';
import type {
  DetectedVideo,
  FrameReport,
  VideoContextSource,
  VideoSnapshot,
} from './video-types';
export type { VideoContextSource, VideoSnapshot } from './video-types';

const mediaEvents = [
  'play',
  'pause',
  'ended',
  'seeking',
  'seeked',
  'loadedmetadata',
  'durationchange',
  'emptied',
  'timeupdate',
  'enterpictureinpicture',
  'leavepictureinpicture',
] as const;

export class VideoContextProvider implements VideoContextSource {
  private snapshot: VideoSnapshot = {
    context: null,
    detectedVideoCount: 0,
    adapterId: 'generic-html5',
    safetyRevision: 0,
  };
  private listeners = new Set<() => void>();
  private videos: HTMLVideoElement[] = [];
  private records = new WeakMap<HTMLVideoElement, DetectedVideo>();
  private report: FrameReport = { videos: [], pageTitle: '' };
  private lastPlayed: HTMLVideoElement | null = null;
  private timer?: ReturnType<typeof setInterval>;
  private mutationTimer?: ReturnType<typeof setTimeout>;
  private observers: MutationObserver[] = [];
  private lastRefresh = 0;
  private lastScan = 0;
  private running = false;
  private adapter: SiteAdapter;

  constructor(
    private document: Document,
    adapters: readonly SiteAdapter[] = [new GenericHtml5Adapter()],
    private shadowRoot: ShadowRootReader = (element) => element.shadowRoot,
  ) {
    this.adapter = selectAdapter(adapters, new URL(document.location.href));
  }

  getSnapshot = (): VideoSnapshot => this.snapshot;
  getReport = (): FrameReport => this.report;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  read = (): VideoSnapshot => {
    this.refresh(true);
    return this.snapshot;
  };
  rescan = async (): Promise<void> => {
    this.refresh(true);
  };

  readVideo(id: string): DetectedVideo | null {
    this.refresh(true);
    return this.report.videos.find((video) => video.id === id) ?? null;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.refresh(true);
    // Poll timing slowly; deep-discover only every 5 seconds or on DOM changes.
    this.timer = setInterval(
      () => this.refresh(Date.now() - this.lastScan >= 5000),
      1000,
    );
    this.document.addEventListener('fullscreenchange', this.onLayoutChange);
    this.document.addEventListener('visibilitychange', this.onLayoutChange);
  }

  stop(): void {
    this.running = false;
    clearInterval(this.timer);
    clearTimeout(this.mutationTimer);
    this.mutationTimer = undefined;
    this.observers.forEach((observer) => observer.disconnect());
    this.observers = [];
    this.document.removeEventListener('fullscreenchange', this.onLayoutChange);
    this.document.removeEventListener('visibilitychange', this.onLayoutChange);
    this.videos.forEach((video) => this.listen(video, false));
    this.videos = [];
    this.listeners.clear();
  }

  private onLayoutChange = () => this.refresh(true);

  private scheduleScan = (records: MutationRecord[]) => {
    const relevant = records.some(
      (record) =>
        !(
          record.target instanceof Element &&
          record.target.closest('wdim-companion')
        ) &&
        (record.type === 'attributes' ||
          [...record.addedNodes, ...record.removedNodes].some(
            (node) =>
              node instanceof Element && node.localName !== 'wdim-companion',
          )),
    );
    if (!relevant || this.mutationTimer) return;
    this.mutationTimer = setTimeout(
      () => {
        this.mutationTimer = undefined;
        this.refresh(true);
      },
      Math.max(100, 1000 - (Date.now() - this.lastScan)),
    );
  };

  private scan(): void {
    this.lastScan = Date.now();
    const { videos, roots } = discoverVideos(this.document, this.shadowRoot);
    this.videos
      .filter((video) => !videos.includes(video))
      .forEach((video) => this.listen(video, false));
    videos
      .filter((video) => !this.videos.includes(video))
      .forEach((video) => this.listen(video, true));
    this.videos = videos;
    this.observers.forEach((observer) => observer.disconnect());
    this.observers = this.running
      ? roots.map((root) => {
          const observer = new MutationObserver(this.scheduleScan);
          observer.observe(root, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['src'],
          });
          return observer;
        })
      : [];
  }

  private onMediaEvent = (event: Event): void => {
    const video = event.currentTarget as HTMLVideoElement;
    if (event.type === 'play') this.lastPlayed = video;
    const before = this.records.get(video)?.context.position.currentTimeSeconds;
    const movedBackward =
      before !== null && before !== undefined && video.currentTime < before;
    if (
      event.type !== 'timeupdate' ||
      movedBackward ||
      performance.now() - this.lastRefresh >= 250
    ) {
      this.refresh(false, event.type === 'play' ? video : undefined);
    }
  };

  private listen(video: HTMLVideoElement, enabled: boolean): void {
    for (const event of mediaEvents) {
      if (enabled) video.addEventListener(event, this.onMediaEvent);
      else video.removeEventListener(event, this.onMediaEvent);
    }
  }

  private refresh(scan = false, played?: HTMLVideoElement): void {
    this.lastRefresh = performance.now();
    if (scan) this.scan();
    const pageTitle = this.document.title.slice(0, 160);
    const videos = this.videos
      .filter((video) => video.isConnected)
      .map((video, index): DetectedVideo => {
        const previous = this.records.get(video);
        const context: PlaybackContext = Object.freeze({
          media: this.adapter.identify(video, this.document),
          position: Object.freeze({
            currentTimeSeconds:
              video.readyState >= 1 &&
              Number.isFinite(video.currentTime) &&
              video.currentTime >= 0
                ? video.currentTime
                : null,
            durationSeconds:
              Number.isFinite(video.duration) && video.duration >= 0
                ? video.duration
                : null,
          }),
          state:
            video.readyState < 1
              ? 'loading'
              : video.ended
                ? 'ended'
                : video.paused
                  ? 'paused'
                  : 'playing',
          pageTitle,
          pageUrl: sanitizePageUrl(this.document.location.href),
        });
        const before = previous?.context.position.currentTimeSeconds;
        const after = context.position.currentTimeSeconds;
        const invalidated =
          previous?.context.media.id !== context.media.id ||
          (before !== null &&
            before !== undefined &&
            (after === null || after < before));
        const detected: DetectedVideo = Object.freeze({
          id: previous?.id ?? createId(),
          label: (
            video.getAttribute('aria-label') ||
            video.title ||
            `Video ${index + 1}`
          ).slice(0, 80),
          context,
          safetyRevision: (previous?.safetyRevision ?? 0) + Number(invalidated),
          ...videoVisibility(video),
          pictureInPicture: isPictureInPicture(video),
          fullscreen: isComposedDescendant(
            this.document.fullscreenElement,
            video,
          ),
          lastPlayedAt:
            video === played ? Date.now() : (previous?.lastPlayedAt ?? 0),
        });
        this.records.set(video, detected);
        return detected;
      });
    const active = selectActiveVideo(
      this.videos.filter((video) => video.isConnected),
      this.document.fullscreenElement,
      this.lastPlayed,
    );
    const selected = active ? this.records.get(active) : undefined;
    const context = selected?.context ?? null;
    const before = this.snapshot.context?.position.currentTimeSeconds;
    const after = context?.position.currentTimeSeconds;
    const invalidated =
      this.snapshot.context?.media.id !== context?.media.id ||
      (before !== null &&
        before !== undefined &&
        (after === null || after === undefined || after < before));
    const next = Object.freeze({
      context,
      detectedVideoCount: videos.length,
      adapterId: this.adapter.id,
      safetyRevision: this.snapshot.safetyRevision + Number(invalidated),
    });
    const report = { videos, pageTitle };
    const changed =
      JSON.stringify(report) !== JSON.stringify(this.report) ||
      JSON.stringify(next) !== JSON.stringify(this.snapshot);
    this.report = report;
    if (JSON.stringify(next) !== JSON.stringify(this.snapshot))
      this.snapshot = next;
    if (changed) this.listeners.forEach((listener) => listener());
  }
}
