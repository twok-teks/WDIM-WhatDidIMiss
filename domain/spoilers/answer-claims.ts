import type { KnowledgeFragment } from './boundary';

export interface AnswerClaim {
  readonly text: string;
  readonly sourceIndexes: readonly number[];
}

// Structural checks are deterministic. Semantic support is checked separately
// on the server; citations alone do not prove that a sentence is true.
export function parseAnswerClaims(
  value: unknown,
  facts: readonly KnowledgeFragment[],
): readonly AnswerClaim[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4)
    throw new Error('Invalid answer claims.');
  return Object.freeze(
    value.map((claim: unknown) => {
      if (
        typeof claim !== 'object' ||
        claim === null ||
        Object.keys(claim).length !== 2 ||
        !('text' in claim) ||
        typeof claim.text !== 'string' ||
        !claim.text.trim() ||
        claim.text.length > 500 ||
        /[<>\r\n]|https?:\/\//i.test(claim.text) ||
        !('sourceIndexes' in claim) ||
        !Array.isArray(claim.sourceIndexes) ||
        !claim.sourceIndexes.length ||
        claim.sourceIndexes.length > 4 ||
        new Set(claim.sourceIndexes).size !== claim.sourceIndexes.length ||
        claim.sourceIndexes.some(
          (index: unknown) =>
            typeof index !== 'number' ||
            !Number.isInteger(index) ||
            index < 0 ||
            !facts[index],
        )
      )
        throw new Error('Invalid answer citation.');
      const indexes = claim.sourceIndexes as number[];
      // A sentence cannot blend an earlier work/background with current events.
      if (
        new Set(indexes.map((index) => facts[index]!.source?.kind ?? 'story'))
          .size !== 1
      )
        throw new Error('Mixed source scopes.');
      return Object.freeze({
        text: claim.text.trim(),
        sourceIndexes: Object.freeze([...indexes]),
      });
    }),
  );
}

export function answerClaimText(
  claim: AnswerClaim,
  facts: readonly KnowledgeFragment[],
): string {
  const kind = facts[claim.sourceIndexes[0]!]!.source?.kind;
  return `${kind === 'background' ? 'Background: ' : kind === 'earlier-work' ? 'Earlier work: ' : ''}${claim.text}`;
}
