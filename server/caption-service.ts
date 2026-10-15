import {
  createObservedWindow,
  createSpoilerBoundary,
  type KnowledgeFragment,
} from '../domain/spoilers/boundary';
import { parseCaptionQuery } from '../domain/spoilers/captions';
import { validateCaptionResult } from '../domain/spoilers/caption-result';
import {
  NO_EVIDENCE,
  selectModelEvidence,
  type GroundedResult,
} from '../domain/spoilers/grounding';
import type { EvidenceModel } from './grounded-service';
import type { BackgroundLookup } from './background-lookup';
import { selectRelated, type RelatedEntry } from './related-context';

export class CaptionService {
  constructor(
    private model: EvidenceModel,
    private background?: BackgroundLookup,
    private related: readonly RelatedEntry[] = [],
  ) {}
  async answer(value: unknown, signal: AbortSignal): Promise<GroundedResult> {
    const query = parseCaptionQuery(value);
    signal.throwIfAborted();
    if (!query.captions.length) return NO_EVIDENCE;
    const position = {
      currentTimeSeconds: query.boundary.maximumAllowedTimestamp,
      durationSeconds: query.boundary.durationSeconds,
    };
    const boundary = createSpoilerBoundary({
      media: {
        id: query.boundary.mediaId,
        title: '',
        confidence: 'unverified',
      },
      position,
      rawPosition: position,
      state: 'paused',
      pageTitle: '',
      pageUrl: '',
      timeline: {
        phase: 'unclassified',
        mapping: 'unverified',
        continuity: 'established',
      },
    });
    const captions: KnowledgeFragment[] = query.captions.map((cue) => ({
      mediaId: boundary.mediaId,
      text: cue.text,
      revealedAtSeconds: cue.observedAt,
      source: { kind: 'caption', label: 'Caption observed during playback' },
    }));
    const outside = [
      ...selectRelated(query, this.related),
      ...((query.options.background
        ? await this.background?.find(query, signal)
        : []) ?? []),
    ];
    // Tool/provider output is untrusted too: validate each external fact before
    // it can enter the model's window, not only after a model selects it.
    const approvedOutside = outside.filter((fact) => {
      try {
        validateCaptionResult({ status: 'answer', facts: [fact] }, query);
        return fact.source?.kind !== 'caption';
      } catch {
        return false;
      }
    });
    const window = createObservedWindow(boundary, [
      ...captions,
      ...approvedOutside,
    ]);
    signal.throwIfAborted();
    const selection = await this.model.select(query.question, window, signal);
    signal.throwIfAborted();
    return validateCaptionResult(
      selectModelEvidence(selection, window.fragments),
      query,
    );
  }
}
