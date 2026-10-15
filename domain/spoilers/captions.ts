import type { PlaybackContext } from '../media/types';
import { canAsk } from './playback';
import { exactKeys, isRecord } from './grounding';

export const PLATFORMS = [
  'youtube',
  'netflix',
  'hulu',
  'disney',
  'prime',
  'generic',
] as const;
export type Platform = (typeof PLATFORMS)[number];
export interface Caption {
  readonly text: string;
  // Observation time, not an inferred story timestamp or a cue's start time.
  readonly observedAt: number;
}
export interface CaptionStatus {
  readonly platform: Platform;
  readonly assetId: string | null;
  readonly count: number;
  readonly since: number | null;
  readonly state: 'waiting' | 'ready' | 'blocked';
}
export interface CaptionEvidence {
  readonly mediaId: string;
  readonly captions: readonly Caption[];
}
export interface ContextOptions {
  readonly background: boolean;
  readonly earlierWorks: boolean;
}
export interface CaptionQuery {
  readonly kind: 'captions';
  readonly question: string;
  readonly boundary: {
    readonly mediaId: string;
    readonly maximumAllowedTimestamp: number;
    readonly durationSeconds: number;
  };
  readonly platform: Platform;
  readonly assetId: string | null;
  readonly captions: readonly Caption[];
  readonly options: ContextOptions;
}
export const NO_CAPTIONS =
  'I don’t have any captions observed for this video yet. Turn on the player’s subtitles or closed captions and let it play. I can use captions captured from this point onward; I can’t reconstruct earlier scenes or see the picture.';

export function parseCaptionQuery(value: unknown): CaptionQuery {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      'kind',
      'question',
      'boundary',
      'platform',
      'assetId',
      'captions',
      'options',
    ]) ||
    value.kind !== 'captions' ||
    typeof value.question !== 'string' ||
    !value.question.trim() ||
    value.question.length > 2000 ||
    !PLATFORMS.includes(value.platform as Platform) ||
    !(
      value.assetId === null ||
      (typeof value.assetId === 'string' &&
        /^[a-zA-Z0-9:_-]{1,160}$/.test(value.assetId))
    ) ||
    !isRecord(value.boundary) ||
    !exactKeys(value.boundary, [
      'mediaId',
      'maximumAllowedTimestamp',
      'durationSeconds',
    ]) ||
    typeof value.boundary.mediaId !== 'string' ||
    !/^[a-zA-Z0-9:_-]{1,160}$/.test(value.boundary.mediaId) ||
    typeof value.boundary.maximumAllowedTimestamp !== 'number' ||
    !Number.isFinite(value.boundary.maximumAllowedTimestamp) ||
    value.boundary.maximumAllowedTimestamp < 0 ||
    typeof value.boundary.durationSeconds !== 'number' ||
    !Number.isFinite(value.boundary.durationSeconds) ||
    value.boundary.durationSeconds <= 0 ||
    value.boundary.maximumAllowedTimestamp > value.boundary.durationSeconds ||
    !Array.isArray(value.captions) ||
    value.captions.length > 64 ||
    !isRecord(value.options) ||
    !exactKeys(value.options, ['background', 'earlierWorks']) ||
    typeof value.options.background !== 'boolean' ||
    typeof value.options.earlierWorks !== 'boolean'
  )
    throw new Error('Invalid caption request.');
  const time = value.boundary.maximumAllowedTimestamp;
  let characters = 0;
  const captions = value.captions.map((item: unknown): Caption => {
    if (
      !isRecord(item) ||
      !exactKeys(item, ['text', 'observedAt']) ||
      typeof item.text !== 'string' ||
      !item.text.trim() ||
      item.text.length > 600 ||
      typeof item.observedAt !== 'number' ||
      !Number.isFinite(item.observedAt) ||
      item.observedAt < 0 ||
      item.observedAt > time
    )
      throw new Error('Caption exceeds the boundary.');
    characters += item.text.length;
    if (characters > 16000) throw new Error('Caption window too large.');
    return Object.freeze({ text: item.text, observedAt: item.observedAt });
  });
  return Object.freeze({
    kind: 'captions',
    question: value.question.trim(),
    boundary: Object.freeze({
      mediaId: value.boundary.mediaId,
      maximumAllowedTimestamp: time,
      durationSeconds: value.boundary.durationSeconds,
    }),
    platform: value.platform as Platform,
    assetId: value.assetId as string | null,
    captions: Object.freeze(captions),
    options: Object.freeze({
      background: value.options.background,
      earlierWorks: value.options.earlierWorks,
    }),
  });
}

export function captionQuery(
  question: string,
  context: PlaybackContext,
  options: ContextOptions,
): CaptionQuery | null {
  if (
    !canAsk(context) ||
    !context.captionStatus ||
    context.captionStatus.state === 'blocked' ||
    context.captionEvidence?.mediaId !== context.media.id ||
    context.position.durationSeconds === null
  )
    return null;
  const time = context.position.currentTimeSeconds!;
  let size = 0;
  const captions = context.captionEvidence.captions
    .filter((cue) => cue.observedAt <= time)
    .slice(-64)
    .reverse()
    .filter((cue) => (size += cue.text.length) <= 16000)
    .reverse();
  return parseCaptionQuery({
    kind: 'captions',
    question,
    boundary: {
      mediaId: context.media.id,
      maximumAllowedTimestamp: time,
      durationSeconds: context.position.durationSeconds,
    },
    platform: context.captionStatus.platform,
    assetId: context.captionStatus.assetId,
    captions,
    options,
  });
}
