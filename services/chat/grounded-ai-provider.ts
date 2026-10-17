import { canAsk } from '../../domain/spoilers/playback';
import { captionQuery, NO_CAPTIONS } from '../../domain/spoilers/captions';
import { validateCaptionResult } from '../../domain/spoilers/caption-result';
import type { ProviderQuery } from '../../domain/spoilers/provider-query';
import {
  UNVERIFIED_CONTEXT,
  parseGroundedQuery,
  renderGroundedResult,
  validateGroundedResult,
  type GroundedResult,
} from '../../domain/spoilers/grounding';
import type { AIProvider, ChatRequest, ProviderAnswer } from './chat-service';

function present(result: GroundedResult): ProviderAnswer {
  const used = result.claims
    ? new Set(result.claims.flatMap((claim) => [...claim.sourceIndexes]))
    : null;
  return Object.freeze({
    text: renderGroundedResult(result),
    sources: Object.freeze(
      result.facts.filter((_, index) => !used || used.has(index)),
    ),
  });
}

export interface GroundedTransport {
  answer(query: ProviderQuery, signal: AbortSignal): Promise<unknown>;
}

export class GroundedAIProvider implements AIProvider {
  readonly mode = 'grounded' as const;
  constructor(private transport: GroundedTransport) {}

  async answer(
    request: ChatRequest,
    signal: AbortSignal,
  ): Promise<string | ProviderAnswer> {
    signal.throwIfAborted();
    if (
      request.playback.captionStatus &&
      request.playback.media.confidence !== 'verified'
    ) {
      const query = captionQuery(
        request.question,
        request.playback,
        request.contextOptions ?? { background: false, earlierWorks: false },
      );
      if (!query || !query.captions.length) return NO_CAPTIONS;
      const result = await this.transport.answer(query, signal);
      signal.throwIfAborted();
      return present(validateCaptionResult(result, query));
    }
    if (
      !canAsk(request.playback) ||
      request.playback.timeline.phase !== 'content'
    ) {
      if (request.playback.timeline.phase !== 'unclassified')
        throw new Error('Playback unavailable.');
      return UNVERIFIED_CONTEXT;
    }
    if (
      request.playback.media.confidence !== 'verified' ||
      request.boundary.timelineMapping !== 'verified'
    )
      return UNVERIFIED_CONTEXT;
    const query = parseGroundedQuery({
      question: request.question,
      boundary: {
        mediaId: request.boundary.mediaId,
        maximumAllowedTimestamp: request.boundary.maximumAllowedTimestamp,
        timelineMapping: request.boundary.timelineMapping,
      },
    });
    const result = await this.transport.answer(query, signal);
    signal.throwIfAborted();
    return present(validateGroundedResult(result, request.boundary));
  }
}
