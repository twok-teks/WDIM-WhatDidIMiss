import type { Caption } from './captions';
import { normalizeTopic } from './topic';

// Rank only already-permitted text. This bounds the provider payload while
// allowing older relevant cues to survive the recent-caption window.
export function retrieveCaptions(
  question: string,
  captions: readonly Caption[],
  time: number,
): readonly Caption[] {
  const safe = captions.filter(
    (cue) => cue.observedAt <= time && cue.observedAt >= 0,
  );
  const terms = [
    ...new Set(normalizeTopic(question).match(/[\p{L}\p{N}]{3,}/gu) ?? []),
  ].filter(
    (term) =>
      ![
        'who',
        'what',
        'when',
        'where',
        'why',
        'how',
        'the',
        'did',
        'does',
        'with',
        'and',
        'was',
        'this',
        'that',
        'about',
        'tell',
        'video',
      ].includes(term),
  );
  const ranked = safe
    .map((cue, index) => ({
      index,
      score: terms.reduce(
        (score, term) =>
          score + Number(normalizeTopic(cue.text).includes(term)),
        0,
      ),
    }))
    .sort((a, b) => b.score - a.score || b.index - a.index);
  const indexes = new Set<number>();
  let size = 0;
  for (const hit of ranked) {
    for (const index of hit.score
      ? [hit.index, hit.index - 1, hit.index + 1]
      : [hit.index]) {
      const cue = safe[index];
      if (
        !cue ||
        indexes.has(index) ||
        indexes.size >= 64 ||
        size + cue.text.length > 16000
      )
        continue;
      indexes.add(index);
      size += cue.text.length;
    }
    if (indexes.size >= 64) break;
  }
  return [...indexes].sort((a, b) => a - b).map((index) => safe[index]!);
}
