import { readFile, stat } from 'node:fs/promises';
import type { CaptionQuery } from '../domain/spoilers/captions';
import type { KnowledgeFragment } from '../domain/spoilers/boundary';
import { exactKeys, isRecord, parseFact } from '../domain/spoilers/grounding';
import { normalizeTopic } from '../domain/spoilers/topic';
export { normalizeTopic } from '../domain/spoilers/topic';

export interface RelatedEntry {
  readonly assetId: string;
  readonly topic: string;
  readonly kind: 'background' | 'earlier-work';
  readonly text: string;
  readonly label: string;
  readonly url: string;
  readonly series: string | null;
  readonly currentRelease: number | null;
  readonly sourceRelease: number | null;
}
export function containsTopic(text: string, topic: string): boolean {
  return ` ${normalizeTopic(text)} `.includes(` ${normalizeTopic(topic)} `);
}
export function topicObservation(
  query: CaptionQuery,
  topic: string,
): number | undefined {
  if (!containsTopic(query.question, topic)) return;
  return query.captions.find((cue) => containsTopic(cue.text, topic))
    ?.observedAt;
}

// Operator-reviewed facts with source URLs, not arbitrary scraped descriptions.
// A release order alone never proves a source is spoiler-safe: the text must be
// vetted as background or limited to the earlier work, without sequel commentary.
export function parseRelated(value: unknown): readonly RelatedEntry[] {
  if (
    !isRecord(value) ||
    !exactKeys(value, ['version', 'entries']) ||
    value.version !== 1 ||
    !Array.isArray(value.entries) ||
    value.entries.length > 500
  )
    throw new Error('Invalid related catalog.');
  return Object.freeze(
    value.entries.map((item: unknown): RelatedEntry => {
      if (
        !isRecord(item) ||
        !exactKeys(item, [
          'assetId',
          'topic',
          'kind',
          'text',
          'label',
          'url',
          'series',
          'currentRelease',
          'sourceRelease',
        ]) ||
        typeof item.assetId !== 'string' ||
        !/^(youtube|netflix|hulu|disney|prime):[a-zA-Z0-9_-]{1,140}$/.test(
          item.assetId,
        ) ||
        typeof item.topic !== 'string' ||
        normalizeTopic(item.topic).length < 3 ||
        item.topic.length > 80 ||
        !['background', 'earlier-work'].includes(String(item.kind)) ||
        !(
          item.series === null ||
          (typeof item.series === 'string' &&
            item.series.length > 0 &&
            item.series.length <= 100)
        ) ||
        ![item.currentRelease, item.sourceRelease].every(
          (order) =>
            order === null ||
            (typeof order === 'number' && Number.isFinite(order) && order >= 0),
        )
      )
        throw new Error('Invalid related entry.');
      if (
        item.kind === 'earlier-work' &&
        (item.series === null ||
          typeof item.currentRelease !== 'number' ||
          typeof item.sourceRelease !== 'number' ||
          item.sourceRelease >= item.currentRelease)
      )
        throw new Error('Earlier release order required.');
      const fact = parseFact({
        mediaId: 'validation',
        revealedAtSeconds: 0,
        text: item.text,
        source: { kind: item.kind, label: item.label, url: item.url },
      });
      return Object.freeze({
        assetId: item.assetId,
        topic: item.topic,
        kind: item.kind as RelatedEntry['kind'],
        text: fact.text,
        label: fact.source!.label,
        url: fact.source!.url!,
        series: item.series as string | null,
        currentRelease: item.currentRelease as number | null,
        sourceRelease: item.sourceRelease as number | null,
      });
    }),
  );
}
export function selectRelated(
  query: CaptionQuery,
  entries: readonly RelatedEntry[],
): KnowledgeFragment[] {
  if (!query.assetId) return [];
  return entries
    .flatMap((entry) => {
      const seen = topicObservation(query, entry.topic);
      if (
        entry.assetId !== query.assetId ||
        seen === undefined ||
        seen > query.boundary.maximumAllowedTimestamp ||
        (entry.kind === 'background'
          ? !query.options.background
          : !query.options.earlierWorks ||
            entry.series === null ||
            entry.currentRelease === null ||
            entry.sourceRelease === null ||
            entry.sourceRelease >= entry.currentRelease)
      )
        return [];
      return [
        {
          mediaId: query.boundary.mediaId,
          revealedAtSeconds: seen,
          text: entry.text,
          source: { kind: entry.kind, label: entry.label, url: entry.url },
        },
      ];
    })
    .slice(0, 8);
}
export async function loadRelated(
  filename?: string,
): Promise<readonly RelatedEntry[]> {
  if (!filename) return [];
  if ((await stat(filename)).size > 1024 * 1024)
    throw new Error('Related catalog too large.');
  return parseRelated(JSON.parse(await readFile(filename, 'utf8')) as unknown);
}
