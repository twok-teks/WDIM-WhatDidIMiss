import {
  compareVideos,
  type ListedVideo,
  type VideoSnapshot,
} from './video-types';

export class VideoDirectory {
  private videos: readonly ListedVideo[] = [];
  private tabId = -1;
  private pinned: string | null = null;
  private signature = '';
  private version = -1;
  private failed?: { id: string; frameVersion: number; message: string };
  private snapshot: VideoSnapshot = {
    context: null,
    detectedVideoCount: 0,
    adapterId: 'generic-html5',
    safetyRevision: 0,
    videos: [],
    selectedVideoId: null,
    selectionMode: 'auto',
    discoveryStatus: 'connecting',
  };

  getSnapshot = () => this.snapshot;

  update(version: number, tabId: number, videos: readonly ListedVideo[]): void {
    if (version < this.version) return;
    this.version = version;
    this.tabId = tabId;
    this.videos = videos;
    this.recompute();
  }

  select(id: string | null): void {
    this.pinned = id;
    this.failed = undefined;
    this.recompute();
  }

  status(
    discoveryStatus: VideoSnapshot['discoveryStatus'],
    discoveryNotice?: string,
  ): void {
    this.snapshot = { ...this.snapshot, discoveryStatus, discoveryNotice };
  }

  disconnect(): void {
    this.version = -1;
    this.failed = undefined;
    this.videos = [];
    this.signature = '';
    this.snapshot = {
      ...this.snapshot,
      context: null,
      videos: [],
      detectedVideoCount: 0,
      safetyRevision: this.snapshot.safetyRevision + 1,
      discoveryStatus: 'connecting',
      discoveryNotice: 'Reconnecting to video discovery…',
    };
  }

  unavailable(message: string): void {
    const selected = this.videos.find(
      (video) => video.id === this.snapshot.selectedVideoId,
    );
    if (selected)
      this.failed = {
        id: selected.id,
        frameVersion: selected.frameVersion,
        message,
      };
    this.signature = '';
    this.snapshot = {
      ...this.snapshot,
      context: null,
      safetyRevision: this.snapshot.safetyRevision + 1,
      discoveryStatus: 'error',
      discoveryNotice: message,
    };
  }

  private recompute(): void {
    // Automatic selection is local to this tab. Other tabs require an explicit choice.
    const selected = this.pinned
      ? this.videos.find((video) => video.id === this.pinned)
      : this.videos
          .filter(
            (video) =>
              video.tabId === this.tabId &&
              (video.visible ||
                video.pictureInPicture ||
                video.context.state === 'playing'),
          )
          .sort(compareVideos)[0];
    // An unrelated frame's update cannot revive a player that failed a fresh read.
    const failed =
      selected &&
      this.failed?.id === selected.id &&
      this.failed.frameVersion === selected.frameVersion
        ? this.failed
        : undefined;
    if (!failed) this.failed = undefined;
    const current = failed ? undefined : selected;
    const signature = current
      ? `${current.id}:${current.context.media.id}:${current.safetyRevision}`
      : '';
    const before = this.snapshot.context?.position.currentTimeSeconds;
    const after = current?.context.position.currentTimeSeconds;
    const invalidated =
      signature !== this.signature ||
      (before !== null &&
        before !== undefined &&
        (after === null || after === undefined || after < before));
    this.signature = signature;
    this.snapshot = Object.freeze({
      context: current?.context ?? null,
      detectedVideoCount: this.videos.length,
      adapterId: 'generic-html5',
      safetyRevision: this.snapshot.safetyRevision + Number(invalidated),
      videos: this.videos,
      selectedVideoId: this.pinned ?? selected?.id ?? null,
      selectionMode: this.pinned ? 'manual' : 'auto',
      discoveryStatus:
        this.snapshot.discoveryStatus === 'refreshing'
          ? 'refreshing'
          : failed
            ? 'error'
            : 'ready',
      discoveryNotice:
        failed?.message ??
        (this.pinned && !selected
          ? 'Selected video is unavailable. Refresh or choose another video.'
          : undefined),
      currentTabId: this.tabId,
    });
  }
}
