// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { CaptionService } from '../server/caption-service';
import { WikidataBackground } from '../server/background-lookup';
import { parseRelated, selectRelated } from '../server/related-context';
import { parseCaptionQuery } from '../domain/spoilers/captions';
import type { EvidenceModel } from '../server/grounded-service';
import { validateCaptionResult } from '../domain/spoilers/caption-result';
import { renderGroundedResult } from '../domain/spoilers/grounding';

const query = () =>
  parseCaptionQuery({
    kind: 'captions',
    question: 'Who is Test Creator?',
    boundary: {
      mediaId: 'session:one',
      maximumAllowedTimestamp: 47,
      durationSeconds: 90,
    },
    platform: 'youtube',
    assetId: 'youtube:abc123',
    captions: [
      { text: 'Test Creator is holding an envelope.', observedAt: 10 },
    ],
    options: { background: false, earlierWorks: false },
  });
describe('caption-only agent', () => {
  it('does not invoke disabled background tools and filters invalid tool evidence before the model', async () => {
    const find = vi.fn(async () => [
      {
        mediaId: 'session:one',
        revealedAtSeconds: 80,
        text: 'FUTURE_SECRET',
        source: {
          kind: 'background' as const,
          label: 'Source',
          url: 'https://example.com',
        },
      },
    ]);
    const select = vi.fn<EvidenceModel['select']>(async () => ({
      status: 'answer',
      factIds: ['f0'],
    }));
    const service = new CaptionService({ select }, { find });
    await service.answer(query(), new AbortController().signal);
    expect(find).not.toHaveBeenCalled();
    await service.answer(
      { ...query(), options: { background: true, earlierWorks: false } },
      new AbortController().signal,
    );
    expect(find).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(select.mock.calls)).not.toContain('FUTURE_SECRET');
  });
  it('answers using observed evidence without pretending movie identity is verified', async () => {
    const model = {
      select: vi.fn<EvidenceModel['select']>(async () => ({
        status: 'answer',
        factIds: ['f0'],
      })),
    };
    const service = new CaptionService(model);
    const answer = await service.answer(query(), new AbortController().signal);
    expect(answer.facts[0]?.text).toContain('holding an envelope');
    const window = model.select.mock.calls[0]![1];
    expect(window.scope).toBe('observed-captions');
    expect(window.boundary.timelineMapping).toBe('unverified');
    expect(window.fragments[0]?.source?.kind).toBe('caption');
  });
  it('rejects future input before invoking the model and empty input without a call', async () => {
    const select = vi.fn<EvidenceModel['select']>();
    const service = new CaptionService({ select });
    await expect(
      service.answer(
        { ...query(), captions: [{ text: 'FUTURE_SECRET', observedAt: 48 }] },
        new AbortController().signal,
      ),
    ).rejects.toThrow();
    expect(
      await service.answer(
        { ...query(), captions: [] },
        new AbortController().signal,
      ),
    ).toEqual({ status: 'insufficient_context', facts: [] });
    expect(select).not.toHaveBeenCalled();
  });
  it('rejects additional model prose, unknown IDs and forged citations', async () => {
    for (const output of [
      { status: 'answer', factIds: ['f99'] },
      { status: 'answer', factIds: ['f0'], text: 'spoiler' },
    ]) {
      const service = new CaptionService({ select: async () => output });
      await expect(
        service.answer(query(), new AbortController().signal),
      ).rejects.toThrow();
    }
  });
});
describe('related evidence', () => {
  const entry = {
    assetId: 'youtube:abc123',
    topic: 'Test Creator',
    kind: 'earlier-work',
    text: 'A reviewed fact limited to the earlier work.',
    label: 'Reviewed source',
    url: 'https://example.com/earlier',
    series: 'series-1',
    currentRelease: 2,
    sourceRelease: 1,
  };
  it('requires opt-in, exact asset, a mentioned topic, and strictly earlier verified release order', () => {
    const entries = parseRelated({ version: 1, entries: [entry] });
    expect(selectRelated(query(), entries)).toEqual([]);
    const enabled = {
      ...query(),
      options: { background: false, earlierWorks: true },
    };
    expect(selectRelated(enabled, entries)).toHaveLength(1);
    expect(
      selectRelated({ ...enabled, assetId: 'youtube:other' }, entries),
    ).toEqual([]);
    expect(selectRelated({ ...enabled, captions: [] }, entries)).toEqual([]);
    expect(() =>
      parseRelated({ version: 1, entries: [{ ...entry, sourceRelease: 3 }] }),
    ).toThrow();
    expect(() =>
      parseRelated({
        version: 1,
        entries: [{ ...entry, url: 'http://localhost/secret' }],
      }),
    ).toThrow();
  });
});
describe('bounded online background tool', () => {
  it('explains missing names and missing earlier-work sources on refusal without a network lookup', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const service = new CaptionService(
      { select: async () => ({ status: 'insufficient_context', factIds: [] }) },
      new WikidataBackground(fetcher),
    );
    const input = {
      ...query(),
      question: 'who is khoai lang thang?',
      options: { background: true, earlierWorks: true },
    };
    const result = await service.answer(input, new AbortController().signal);
    expect(result.contextIssues).toEqual([
      'background_name_not_observed',
      'earlier_catalog_unavailable',
    ]);
    expect(fetcher).not.toHaveBeenCalled();
    expect(
      renderGroundedResult(validateCaptionResult(result, input)),
    ).toContain('That name is not in the captions');
    expect(() =>
      validateCaptionResult(
        { ...result, contextIssues: ['arbitrary provider text'] },
        input,
      ),
    ).toThrow();
    expect(() => validateCaptionResult(result, query())).toThrow();
    expect(() =>
      validateCaptionResult(
        {
          status: 'answer',
          facts: [
            {
              mediaId: input.boundary.mediaId,
              text: input.captions[0]!.text,
              revealedAtSeconds: 10,
              source: {
                kind: 'caption',
                label: 'Caption observed during playback',
              },
            },
          ],
          contextIssues: ['background_no_match'],
        },
        input,
      ),
    ).toThrow();
  });
  it('distinguishes temporary background failures and still answers supported caption questions', async () => {
    const lookup = new WikidataBackground(
      vi.fn<typeof fetch>().mockRejectedValue(new Error('PRIVATE_ERROR')),
    );
    const input = {
      ...query(),
      options: { background: true, earlierWorks: false },
    };
    const fail = await lookup.lookup(input, new AbortController().signal);
    expect(fail).toEqual({ facts: [], issue: 'background_lookup_unavailable' });
    const service = new CaptionService(
      { select: async () => ({ status: 'answer', factIds: ['f0'] }) },
      lookup,
    );
    const result = await service.answer(input, new AbortController().signal);
    expect(result.status).toBe('answer');
    expect(result.contextIssues).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('PRIVATE_ERROR');
  });
  const response = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200 });
  const claim = (id: string) => ({
    mainsnak: { datavalue: { value: { id } } },
  });
  it('accepts supported direct and polite questions', async () => {
    for (const question of [
      'who is khoai lang thang?',
      'Can you tell me about Khoai Lang Thang?',
      'Please tell me about Khoai Lang Thang.',
    ]) {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          response({ search: [{ id: 'Q123', label: 'Khoai Lang Thang' }] }),
        )
        .mockResolvedValueOnce(
          response({
            entities: {
              Q123: {
                claims: { P31: [claim('Q5')], P106: [claim('Q17125263')] },
              },
            },
          }),
        );
      const result = await new WikidataBackground(fetcher).lookup(
        {
          ...query(),
          question,
          captions: [{ text: 'Khoai Lang Thang', observedAt: 10 }],
          options: { background: true, earlierWorks: false },
        },
        new AbortController().signal,
      );
      expect(result.facts).toHaveLength(1);
      expect(result.issue).toBeUndefined();
    }
  });
  it('does not look up names absent from watched captions or when disabled', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const lookup = new WikidataBackground(fetcher);
    expect(await lookup.find(query(), new AbortController().signal)).toEqual(
      [],
    );
    expect(
      await lookup.find(
        {
          ...query(),
          captions: [],
          options: { background: true, earlierWorks: false },
        },
        new AbortController().signal,
      ),
    ).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('uses only allowed human occupations, not descriptions/plots/cast facts', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({
          search: [
            { id: 'Q123', label: 'Test Creator', description: 'FUTURE_SECRET' },
          ],
        }),
      )
      .mockResolvedValueOnce(
        response({
          entities: {
            Q123: {
              claims: {
                P31: [claim('Q5')],
                P106: [claim('Q17125263'), claim('Q999')],
                P999: [{ text: 'FUTURE_SECRET' }],
              },
            },
          },
        }),
      );
    const facts = await new WikidataBackground(fetcher).find(
      { ...query(), options: { background: true, earlierWorks: false } },
      new AbortController().signal,
    );
    expect(facts[0]?.text).toContain('YouTuber');
    expect(JSON.stringify(facts)).not.toContain('FUTURE_SECRET');
    expect(facts[0]?.source?.url).toBe('https://www.wikidata.org/wiki/Q123');
    expect(
      fetcher.mock.calls.every(
        (call) => new URL(String(call[0])).hostname === 'www.wikidata.org',
      ),
    ).toBe(true);
    expect(JSON.stringify(fetcher.mock.calls)).not.toContain(
      'holding an envelope',
    );
  });
  it('declines ambiguous identities and fictional characters', async () => {
    const options = { background: true, earlierWorks: false };
    const ambiguous = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        search: [
          { id: 'Q1', label: 'Test Creator' },
          { id: 'Q2', label: 'Test Creator' },
        ],
      }),
    );
    expect(
      await new WikidataBackground(ambiguous).find(
        { ...query(), options },
        new AbortController().signal,
      ),
    ).toEqual([]);
    expect(ambiguous).toHaveBeenCalledTimes(1);
    const fictional = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({ search: [{ id: 'Q1', label: 'Test Creator' }] }),
      )
      .mockResolvedValueOnce(
        response({
          entities: {
            Q1: {
              claims: { P31: [claim('Q95074')], P106: [claim('Q17125263')] },
            },
          },
        }),
      );
    expect(
      await new WikidataBackground(fictional).find(
        { ...query(), options },
        new AbortController().signal,
      ),
    ).toEqual([]);
  });
});
