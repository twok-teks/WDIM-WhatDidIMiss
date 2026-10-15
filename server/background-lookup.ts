import type { CaptionQuery } from '../domain/spoilers/captions';
import type { KnowledgeFragment } from '../domain/spoilers/boundary';
import { isRecord } from '../domain/spoilers/grounding';
import { readJson } from '../services/chat/read-json';
import { normalizeTopic, topicObservation } from './related-context';

export interface BackgroundLookup {
  find(
    query: CaptionQuery,
    signal: AbortSignal,
  ): Promise<readonly KnowledgeFragment[]>;
}
const occupations: Record<string, string> = {
  Q17125263: 'YouTuber',
  Q33999: 'actor',
  Q2526255: 'film director',
  Q639669: 'musician',
  Q877517: 'blogger',
};
function entityIds(
  entity: Record<string, unknown>,
  property: string,
): string[] {
  if (!isRecord(entity.claims) || !Array.isArray(entity.claims[property]))
    return [];
  return entity.claims[property].flatMap((claim: unknown) => {
    if (
      !isRecord(claim) ||
      claim.rank === 'deprecated' ||
      !isRecord(claim.mainsnak) ||
      !isRecord(claim.mainsnak.datavalue) ||
      !isRecord(claim.mainsnak.datavalue.value)
    )
      return [];
    const id = claim.mainsnak.datavalue.value.id;
    return typeof id === 'string' && /^Q\d+$/.test(id) ? [id] : [];
  });
}

// Deliberately narrow online tool: no article bodies, descriptions, filmographies,
// cast/character relationships, cause-of-death, plot search, or model-written facts.
export class WikidataBackground implements BackgroundLookup {
  constructor(private fetcher: typeof fetch = fetch) {}
  async find(
    query: CaptionQuery,
    signal: AbortSignal,
  ): Promise<readonly KnowledgeFragment[]> {
    if (!query.options.background) return [];
    const name = query.question
      .match(
        /^\s*(?:who is|who was|tell me about)\s+([\p{L}\p{M} .'-]{3,80})[?.!]?\s*$/iu,
      )?.[1]
      ?.replace(/[?.!]+$/, '')
      .trim();
    if (!name || normalizeTopic(name).split(' ').length < 2) return [];
    const seen = topicObservation(query, name);
    if (seen === undefined) return [];
    const combined = AbortSignal.any([signal, AbortSignal.timeout(5000)]);
    const request = async (parameters: Record<string, string>) => {
      const url = new URL('https://www.wikidata.org/w/api.php');
      url.search = new URLSearchParams({
        ...parameters,
        format: 'json',
      }).toString();
      return readJson(
        await this.fetcher(url, {
          signal: combined,
          redirect: 'error',
          headers: {
            'User-Agent':
              'WDIM/0.1 local-video-companion (background lookup; no crawling)',
          },
        }),
        1024 * 1024,
      );
    };
    try {
      const search = await request({
        action: 'wbsearchentities',
        search: name,
        language: 'en',
        type: 'item',
        limit: '5',
      });
      if (!isRecord(search) || !Array.isArray(search.search)) return [];
      const matches = search.search.filter(
        (item: unknown) =>
          isRecord(item) &&
          typeof item.id === 'string' &&
          /^Q\d+$/.test(item.id) &&
          ((typeof item.label === 'string' &&
            normalizeTopic(item.label) === normalizeTopic(name)) ||
            (isRecord(item.match) &&
              typeof item.match.text === 'string' &&
              normalizeTopic(item.match.text) === normalizeTopic(name))),
      );
      if (
        matches.length !== 1 ||
        !isRecord(matches[0]) ||
        typeof matches[0].id !== 'string'
      )
        return [];
      const id = matches[0].id;
      const data = await request({
        action: 'wbgetentities',
        ids: id,
        props: 'claims',
        languages: 'en',
      });
      if (
        !isRecord(data) ||
        !isRecord(data.entities) ||
        !isRecord(data.entities[id])
      )
        return [];
      const entity = data.entities[id];
      if (!entityIds(entity, 'P31').includes('Q5')) return [];
      const roles = [
        ...new Set(
          entityIds(entity, 'P106')
            .map((value) => occupations[value])
            .filter(Boolean),
        ),
      ].slice(0, 3);
      if (!roles.length) return [];
      return [
        {
          mediaId: query.boundary.mediaId,
          revealedAtSeconds: seen,
          text: `Wikidata lists a person matching the name “${name}” as: ${roles.join(', ')}. This name match does not independently identify the person shown in the video.`,
          source: {
            kind: 'background',
            label: 'Wikidata · matching name',
            url: `https://www.wikidata.org/wiki/${id}`,
          },
        },
      ];
    } catch {
      signal.throwIfAborted();
      return []; // Optional enrichment must not turn a caption answer into an outage.
    }
  }
}
