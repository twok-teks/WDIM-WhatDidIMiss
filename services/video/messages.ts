import type { FrameReport, ListedVideo } from './video-types';
import type { CaptionEvidence } from '../../domain/spoilers/captions';

// v3 adds selected-frame caption evidence to fresh read replies, never catalogs. Old collectors
// must reconnect/reload rather than supplying a partial safety contract.
export const MEDIA_PORT = 'wdim-media-v3';
export const UI_PORT = 'wdim-video-ui-v3';
export const RESCAN_MESSAGE = 'wdim:rescan-v3';

export type ClientMessage =
  | { type: 'report'; report: FrameReport }
  | { type: 'watch' }
  | { type: 'rescan'; requestId: string }
  | { type: 'read'; requestId: string; videoId: string }
  | {
      type: 'read-result';
      requestId: string;
      report: FrameReport;
      evidence?: CaptionEvidence;
    };

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
      evidence?: CaptionEvidence;
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
