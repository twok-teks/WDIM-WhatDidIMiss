import {
  parseAnswerClaims,
  answerClaimText,
  type AnswerClaim,
} from './answer-claims';
import {
  filterAllowedKnowledge,
  type KnowledgeFragment,
  type SpoilerBoundary,
} from './boundary';
import { CONTEXT_FEEDBACK, type ContextIssue } from './context-feedback';

export const INSUFFICIENT_CONTEXT =
  "I don't have enough verified information at your current position to answer. I won't infer missing details or confirm what happens later.";
export const UNVERIFIED_CONTEXT =
  "This video's identity and story timeline have not been verified. I can't safely answer story questions yet. Nothing was sent to the AI.";

export interface GroundedQuery {
  readonly question: string;
  readonly boundary: {
    readonly mediaId: string;
    readonly maximumAllowedTimestamp: number;
    readonly timelineMapping: 'verified';
  };
}

export interface GroundedResult {
  readonly status: 'answer' | 'insufficient_context';
  readonly facts: readonly KnowledgeFragment[];
  readonly claims?: readonly AnswerClaim[];
  readonly contextIssues?: readonly ContextIssue[];
}

export const NO_EVIDENCE: GroundedResult = Object.freeze({
  status: 'insufficient_context',
  facts: Object.freeze([]),
});

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

export function parseGroundedQuery(value: unknown): GroundedQuery {
  if (
    !isRecord(value) ||
    !exactKeys(value, ['question', 'boundary']) ||
    typeof value.question !== 'string' ||
    !value.question.trim() ||
    value.question.length > 2000 ||
    !isRecord(value.boundary) ||
    !exactKeys(value.boundary, [
      'mediaId',
      'maximumAllowedTimestamp',
      'timelineMapping',
    ]) ||
    typeof value.boundary.mediaId !== 'string' ||
    !/^[a-zA-Z0-9:_-]{1,160}$/.test(value.boundary.mediaId) ||
    value.boundary.timelineMapping !== 'verified' ||
    typeof value.boundary.maximumAllowedTimestamp !== 'number' ||
    !Number.isFinite(value.boundary.maximumAllowedTimestamp) ||
    value.boundary.maximumAllowedTimestamp < 0
  ) {
    throw new Error('Invalid grounded request.');
  }
  return Object.freeze({
    question: value.question.trim(),
    boundary: Object.freeze({
      mediaId: value.boundary.mediaId,
      maximumAllowedTimestamp: value.boundary.maximumAllowedTimestamp,
      timelineMapping: 'verified' as const,
    }),
  });
}

export function parseFact(value: unknown): KnowledgeFragment {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      'mediaId',
      'revealedAtSeconds',
      'text',
      ...(value.source === undefined ? [] : ['source']),
    ]) ||
    typeof value.mediaId !== 'string' ||
    !/^[a-zA-Z0-9:_-]{1,160}$/.test(value.mediaId) ||
    typeof value.revealedAtSeconds !== 'number' ||
    !Number.isFinite(value.revealedAtSeconds) ||
    value.revealedAtSeconds < 0 ||
    typeof value.text !== 'string' ||
    !value.text.trim() ||
    value.text.length > 1000
  ) {
    throw new Error('Invalid evidence.');
  }
  let source: KnowledgeFragment['source'];
  if (value.source !== undefined) {
    const item = value.source;
    if (
      !isRecord(item) ||
      !exactKeys(item, [
        'kind',
        'label',
        ...(item.url === undefined ? [] : ['url']),
      ]) ||
      !['caption', 'background', 'earlier-work'].includes(String(item.kind)) ||
      typeof item.label !== 'string' ||
      !item.label.trim() ||
      item.label.length > 160 ||
      (item.kind !== 'caption' && typeof item.url !== 'string')
    )
      throw new Error('Invalid evidence source.');
    if (item.url !== undefined) {
      if (typeof item.url !== 'string' || item.url.length > 500)
        throw new Error('Invalid source URL.');
      const url = new URL(item.url);
      if (url.protocol !== 'https:' || url.username || url.password || url.hash)
        throw new Error('Invalid source URL.');
    }
    source = Object.freeze({
      kind: item.kind as NonNullable<KnowledgeFragment['source']>['kind'],
      label: item.label,
      ...(typeof item.url === 'string' ? { url: item.url } : {}),
    });
  }
  return Object.freeze({
    mediaId: value.mediaId,
    revealedAtSeconds: value.revealedAtSeconds,
    text: value.text,
    ...(source ? { source } : {}),
  });
}

// The gateway checks semantic support; the client rechecks structure and boundary.
export function validateGroundedResult(
  value: unknown,
  boundary: SpoilerBoundary,
): GroundedResult {
  if (
    boundary.timelineMapping !== 'verified' ||
    !isRecord(value) ||
    !exactKeys(value, [
      'status',
      'facts',
      ...(value.claims === undefined ? [] : ['claims']),
    ]) ||
    !['answer', 'insufficient_context'].includes(String(value.status)) ||
    !Array.isArray(value.facts) ||
    value.facts.length > 4
  ) {
    throw new Error('Invalid grounded response.');
  }
  const facts = value.facts.map(parseFact);
  if (
    (value.status === 'answer') !== facts.length > 0 ||
    facts.some((fact) => fact.mediaId !== boundary.mediaId) ||
    filterAllowedKnowledge(boundary, facts).fragments.length !== facts.length ||
    new Set(facts.map((fact) => `${fact.revealedAtSeconds}:${fact.text}`))
      .size !== facts.length
  ) {
    throw new Error('Response exceeds the allowed evidence.');
  }
  return Object.freeze({
    status: value.status as GroundedResult['status'],
    facts: Object.freeze(facts),
    ...(value.claims === undefined
      ? {}
      : { claims: parseAnswerClaims(value.claims, facts) }),
  });
}

export function renderGroundedResult(result: GroundedResult): string {
  if (result.status !== 'answer')
    return result.contextIssues?.length
      ? `I couldn't find enough supported information to answer. ${result.contextIssues.map((issue) => CONTEXT_FEEDBACK[issue]).join(' ')}`
      : INSUFFICIENT_CONTEXT;
  if (result.claims)
    return result.claims
      .map((claim) => answerClaimText(claim, result.facts))
      .join('\n\n');
  return 'I found relevant evidence, but a written answer is unavailable. You can read the excerpts under Sources.';
}

export function selectModelEvidence(
  value: unknown,
  allowed: readonly KnowledgeFragment[],
): GroundedResult {
  if (
    !isRecord(value) ||
    !exactKeys(value, ['status', 'factIds']) ||
    !['answer', 'insufficient_context'].includes(String(value.status)) ||
    !Array.isArray(value.factIds) ||
    value.factIds.length > 4 ||
    new Set(value.factIds).size !== value.factIds.length ||
    (value.status === 'answer') !== value.factIds.length > 0
  ) {
    throw new Error('Invalid model selection.');
  }
  const facts = value.factIds.map((id: unknown) => {
    if (typeof id !== 'string' || !/^f[0-9]+$/.test(id))
      throw new Error('Invalid fact ID.');
    const index = Number(id.slice(1));
    const fact = allowed[index];
    if (!fact || id !== `f${index}`) throw new Error('Unknown fact ID.');
    return fact;
  });
  return { status: value.status as GroundedResult['status'], facts };
}
