import { readFile, stat } from 'node:fs/promises';
import type { KnowledgeFragment } from '../domain/spoilers/boundary';
import { exactKeys, isRecord, parseFact } from '../domain/spoilers/grounding';

export interface VerifiedAsset {
  readonly mediaId: string;
  readonly durationSeconds: number;
  readonly facts: readonly KnowledgeFragment[];
}

export function parseCatalog(value: unknown): readonly VerifiedAsset[] {
  if (
    !isRecord(value) ||
    !exactKeys(value, ['version', 'assets']) ||
    value.version !== 1 ||
    !Array.isArray(value.assets) ||
    value.assets.length > 100
  )
    throw new Error('Invalid verified catalog.');
  const assets = value.assets.map((asset: unknown): VerifiedAsset => {
    if (
      !isRecord(asset) ||
      !exactKeys(asset, ['mediaId', 'durationSeconds', 'facts']) ||
      typeof asset.mediaId !== 'string' ||
      !/^[a-zA-Z0-9:_-]{1,160}$/.test(asset.mediaId) ||
      typeof asset.durationSeconds !== 'number' ||
      !Number.isFinite(asset.durationSeconds) ||
      asset.durationSeconds <= 0 ||
      !Array.isArray(asset.facts) ||
      asset.facts.length > 10000
    )
      throw new Error('Invalid verified asset.');
    const facts = asset.facts.map(parseFact);
    if (
      facts.some(
        (fact) =>
          fact.mediaId !== asset.mediaId ||
          fact.revealedAtSeconds > (asset.durationSeconds as number),
      ) ||
      new Set(facts.map((fact) => `${fact.revealedAtSeconds}:${fact.text}`))
        .size !== facts.length
    )
      throw new Error('Invalid asset evidence.');
    return Object.freeze({
      mediaId: asset.mediaId,
      durationSeconds: asset.durationSeconds,
      facts: Object.freeze(facts),
    });
  });
  if (new Set(assets.map((asset) => asset.mediaId)).size !== assets.length)
    throw new Error('Duplicate asset.');
  return Object.freeze(assets);
}

// Operator-authored annotations are trusted inputs, never populated from page text/model output.
export async function loadCatalog(
  filename?: string,
): Promise<readonly VerifiedAsset[]> {
  if (!filename) return Object.freeze([]);
  if ((await stat(filename)).size > 1024 * 1024)
    throw new Error('Catalog too large.');
  return parseCatalog(JSON.parse(await readFile(filename, 'utf8')) as unknown);
}
