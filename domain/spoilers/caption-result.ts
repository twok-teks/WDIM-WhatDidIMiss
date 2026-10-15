import type { CaptionQuery } from './captions';
import {
  exactKeys,
  isRecord,
  parseFact,
  type GroundedResult,
} from './grounding';

export function validateCaptionResult(
  value: unknown,
  query: CaptionQuery,
): GroundedResult {
  if (
    !isRecord(value) ||
    !exactKeys(value, ['status', 'facts']) ||
    !['answer', 'insufficient_context'].includes(String(value.status)) ||
    !Array.isArray(value.facts) ||
    value.facts.length > 4 ||
    (value.status === 'answer') !== value.facts.length > 0
  )
    throw new Error('Invalid caption result.');
  const facts = value.facts.map(parseFact);
  if (
    new Set(facts.map((fact) => `${fact.revealedAtSeconds}:${fact.text}`))
      .size !== facts.length
  )
    throw new Error('Duplicate evidence.');
  for (const fact of facts) {
    if (
      fact.mediaId !== query.boundary.mediaId ||
      fact.revealedAtSeconds > query.boundary.maximumAllowedTimestamp ||
      !fact.source
    )
      throw new Error('Evidence exceeds boundary.');
    if (
      fact.source.kind === 'caption' &&
      !query.captions.some(
        (cue) =>
          cue.text === fact.text && cue.observedAt === fact.revealedAtSeconds,
      )
    )
      throw new Error('Caption was never observed.');
    if (
      (fact.source.kind === 'background' && !query.options.background) ||
      (fact.source.kind === 'earlier-work' && !query.options.earlierWorks)
    )
      throw new Error('Outside context not allowed.');
  }
  return Object.freeze({
    status: value.status as GroundedResult['status'],
    facts: Object.freeze(facts),
  });
}
