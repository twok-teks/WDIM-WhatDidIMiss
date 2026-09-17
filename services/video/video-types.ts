import type { PlaybackContext } from '../../domain/media/types';

export interface DetectedVideo {
  readonly id: string;
  readonly label: string;
  readonly context: PlaybackContext;
  readonly safetyRevision: number;
  readonly visible: boolean;
  readonly area: number;
  readonly pictureInPicture: boolean;
  readonly fullscreen: boolean;
  readonly lastPlayedAt: number;
}

export interface ListedVideo extends DetectedVideo {
  readonly tabId: number;
  readonly frameId: number;
  readonly tabTitle: string;
  readonly frameVersion: number;
}

export interface FrameReport {
  readonly videos: readonly DetectedVideo[];
  readonly pageTitle: string;
}

export interface VideoSnapshot {
  readonly context: PlaybackContext | null;
  readonly detectedVideoCount: number;
  readonly adapterId: string;
  readonly safetyRevision: number;
  readonly videos?: readonly ListedVideo[];
  readonly selectedVideoId?: string | null;
  readonly selectionMode?: 'auto' | 'manual';
  readonly discoveryStatus?: 'connecting' | 'ready' | 'refreshing' | 'error';
  readonly discoveryNotice?: string;
  readonly currentTabId?: number;
}

export interface VideoContextSource {
  subscribe(listener: () => void): () => void;
  getSnapshot(): VideoSnapshot;
  read(): VideoSnapshot | Promise<VideoSnapshot>;
  rescan?(): Promise<void>;
  selectVideo?(id: string | null): void;
  activate?(): void;
}

export function compareVideos(a: DetectedVideo, b: DetectedVideo): number {
  return (
    Number(b.pictureInPicture) - Number(a.pictureInPicture) ||
    Number(b.fullscreen) - Number(a.fullscreen) ||
    Number(b.context.state === 'playing') -
      Number(a.context.state === 'playing') ||
    Number(b.visible) - Number(a.visible) ||
    b.lastPlayedAt - a.lastPlayedAt ||
    b.area - a.area
  );
}
