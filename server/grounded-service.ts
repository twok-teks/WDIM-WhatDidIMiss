import {
  createSpoilerBoundary,
  filterAllowedKnowledge,
  type AllowedContextWindow,
} from '../domain/spoilers/boundary';
import {
  NO_EVIDENCE,
  parseGroundedQuery,
  selectModelEvidence,
  validateGroundedResult,
  type GroundedResult,
} from '../domain/spoilers/grounding';
import type { VerifiedAsset } from './catalog';
import { isRecord } from '../domain/spoilers/grounding';
import { CaptionService } from './caption-service';
import type { BackgroundLookup } from './background-lookup';
import type { RelatedEntry } from './related-context';

export interface EvidenceModel {
  select(
    question: string,
    window: AllowedContextWindow,
    signal: AbortSignal,
  ): Promise<unknown>;
}

export class GroundedService {
  private captions: CaptionService;
  constructor(
    private catalog: readonly VerifiedAsset[],
    private model: EvidenceModel,
    background?: BackgroundLookup,
    related: readonly RelatedEntry[] = [],
  ) {
    this.captions = new CaptionService(model, background, related);
  }

  async answer(value: unknown, signal: AbortSignal): Promise<GroundedResult> {
    if (isRecord(value) && value.kind === 'captions')
      return this.captions.answer(value, signal);
    signal.throwIfAborted();
    const query = parseGroundedQuery(value);
    const asset = this.catalog.find(
      (candidate) => candidate.mediaId === query.boundary.mediaId,
    );
    if (!asset) return NO_EVIDENCE;
    const position = {
      currentTimeSeconds: query.boundary.maximumAllowedTimestamp,
      durationSeconds: asset.durationSeconds,
    };
    const boundary = createSpoilerBoundary({
      media: { id: asset.mediaId, title: '', confidence: 'verified' },
      position,
      rawPosition: position,
      timeline: {
        phase: 'content',
        mapping: 'verified',
        continuity: 'established',
      },
      state: 'paused',
      pageTitle: '',
      pageUrl: '',
    });
    const permitted = filterAllowedKnowledge(boundary, asset.facts);
    // Bound the prompt only AFTER excluding every later/foreign fact.
    const recent = [...permitted.fragments]
      .sort((a, b) => a.revealedAtSeconds - b.revealedAtSeconds)
      .slice(-32);
    const window = filterAllowedKnowledge(boundary, recent);
    if (!window.fragments.length) return NO_EVIDENCE;
    const selection = await this.model.select(query.question, window, signal);
    signal.throwIfAborted();
    return validateGroundedResult(
      selectModelEvidence(selection, window.fragments),
      boundary,
    );
  }
}
