import type { AllowedContextWindow } from '../domain/spoilers/boundary';
import {
  parseAnswerClaims,
  type AnswerClaim,
} from '../domain/spoilers/answer-claims';
import {
  exactKeys,
  isRecord,
  NO_EVIDENCE,
  type GroundedResult,
} from '../domain/spoilers/grounding';

export interface AnswerWriter {
  compose(
    question: string,
    window: AllowedContextWindow,
    signal: AbortSignal,
  ): Promise<unknown>;
  verify(
    question: string,
    window: AllowedContextWindow,
    claims: readonly AnswerClaim[],
    signal: AbortSignal,
  ): Promise<unknown>;
}

export async function writeSupportedAnswer(
  writer: AnswerWriter | undefined,
  question: string,
  window: AllowedContextWindow,
  result: GroundedResult,
  signal: AbortSignal,
): Promise<GroundedResult> {
  if (!writer || result.status !== 'answer') return result;
  // Both generation and review get ONLY the validated selected evidence.
  const selected = Object.freeze({ ...window, fragments: result.facts });
  const draft = await writer.compose(question, selected, signal);
  signal.throwIfAborted();
  if (
    !isRecord(draft) ||
    !exactKeys(draft, ['claims']) ||
    !Array.isArray(draft.claims)
  )
    throw new Error('Invalid answer draft.');
  if (!draft.claims.length) return NO_EVIDENCE;
  const claims = parseAnswerClaims(draft.claims, result.facts);
  const review = await writer.verify(question, selected, claims, signal);
  signal.throwIfAborted();
  if (
    !isRecord(review) ||
    !exactKeys(review, ['answersQuestion', 'supported']) ||
    typeof review.answersQuestion !== 'boolean' ||
    !Array.isArray(review.supported) ||
    review.supported.length !== claims.length ||
    review.supported.some((item: unknown) => typeof item !== 'boolean')
  )
    throw new Error('Invalid answer review.');
  if (!review.answersQuestion || review.supported.some((item) => item !== true))
    return NO_EVIDENCE;
  return Object.freeze({ ...result, claims });
}
