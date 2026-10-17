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
import { writeSupportedAnswer } from './answer-writer';
import type { ContextIssue } from '../domain/spoilers/context-feedback';

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
      source: {
        kind: 'caption',
        label:
          cue.origin === 'transcript'
            ? 'Subtitle track (cue end)'
            : 'Caption observed during playback',
      },
    }));
    const related = selectRelated(query, this.related);
    const issues: ContextIssue[] = [];
    const background = !query.options.background
      ? { facts: [] }
      : this.background?.lookup
        ? await this.background.lookup(query, signal)
        : this.background
          ? { facts: await this.background.find(query, signal) }
          : { facts: [], issue: 'background_lookup_unavailable' as const };
    if (background.issue) issues.push(background.issue);
    if (
      query.options.earlierWorks &&
      !related.some((fact) => fact.source?.kind === 'earlier-work')
    )
      issues.push(
        this.related.some((entry) => entry.kind === 'earlier-work')
          ? 'earlier_no_match'
          : 'earlier_catalog_unavailable',
      );
    const outside = [...related, ...background.facts];
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
    const result = validateCaptionResult(
      selectModelEvidence(selection, window.fragments),
      query,
    );
    const answer = await writeSupportedAnswer(
      this.model.writer,
      query.question,
      window,
      result,
      signal,
    );
    return answer.status === 'insufficient_context' && issues.length
      ? validateCaptionResult({ ...answer, contextIssues: issues }, query)
      : answer;
  }
}
