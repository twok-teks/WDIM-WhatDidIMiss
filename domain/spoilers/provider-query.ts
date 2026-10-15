import { parseCaptionQuery, type CaptionQuery } from './captions';
import { isRecord, parseGroundedQuery, type GroundedQuery } from './grounding';
export type ProviderQuery = GroundedQuery | CaptionQuery;
export function parseProviderQuery(value: unknown): ProviderQuery {
  return isRecord(value) && value.kind === 'captions'
    ? parseCaptionQuery(value)
    : parseGroundedQuery(value);
}
