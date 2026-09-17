import type { FrameReport, ListedVideo } from './video-types';

export const MEDIA_PORT = 'wdim-media-v1';
export const UI_PORT = 'wdim-video-ui-v1';
export const RESCAN_MESSAGE = 'wdim:rescan-v1';

export type ClientMessage =
  | { type: 'report'; report: FrameReport }
  | { type: 'watch' }
  | { type: 'rescan'; requestId: string }
  | { type: 'read'; requestId: string; videoId: string }
  | { type: 'read-result'; requestId: string; report: FrameReport };

export type ServerMessage =
  | {
      type: 'catalog';
      version: number;
      tabId: number;
      videos: readonly ListedVideo[];
    }
  | { type: 'rescan' }
  | { type: 'read'; requestId: string; videoId: string }
  | {
      type: 'read-result';
      requestId: string;
      version: number;
      tabId: number;
      videos: readonly ListedVideo[];
      error?: string;
    }
  | { type: 'rescan-result'; requestId: string; unavailableTabs: number };

export function isMessage(value: unknown): value is { type: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof value.type === 'string'
  );
}
