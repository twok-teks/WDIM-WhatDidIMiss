// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createSpoilerBoundary } from '../domain/spoilers/boundary';
import {
  INSUFFICIENT_CONTEXT,
  UNVERIFIED_CONTEXT,
  parseGroundedQuery,
  renderGroundedResult,
  selectModelEvidence,
  validateGroundedResult,
} from '../domain/spoilers/grounding';
import { ChatService } from '../services/chat/chat-service';
import {
  GroundedAIProvider,
  type GroundedTransport,
} from '../services/chat/grounded-ai-provider';
import { parseCatalog } from '../server/catalog';
import {
  GroundedService,
  type EvidenceModel,
} from '../server/grounded-service';
import { GroqEvidenceModel } from '../server/groq-model';
import { playback } from './helpers';

const mediaId = 'verified-story-v1';
const known = {
  mediaId,
  revealedAtSeconds: 10,
  text: 'Mira holds a sealed envelope.',
};
const future = {
  mediaId,
  revealedAtSeconds: 75,
  text: 'FUTURE_SECRET: the envelope contains a map.',
};
const catalog = parseCatalog({
  version: 1,
  assets: [{ mediaId, durationSeconds: 90, facts: [known, future] }],
});
const query = (at = 47) =>
  parseGroundedQuery({
    question: 'What is Mira holding?',
    boundary: {
      mediaId,
      maximumAllowedTimestamp: at,
      timelineMapping: 'verified',
    },
  });
const context = () => ({
  ...playback(),
  media: {
    id: mediaId,
    title: 'PRIVATE TITLE',
    confidence: 'verified' as const,
  },
  pageUrl: 'https://private.example/video',
  pageTitle: 'PRIVATE TITLE',
});

describe('grounded provider', () => {
  it('refuses unknown identity/timeline locally without invoking transport', async () => {
    const answer = vi.fn();
    const service = new ChatService(new GroundedAIProvider({ answer }));
    expect(
      (await service.ask('Question', playback(), new AbortController().signal))
        .text,
    ).toBe(UNVERIFIED_CONTEXT);
    const unclassified = {
      ...context(),
      timeline: {
        phase: 'unclassified' as const,
        mapping: 'unverified' as const,
        continuity: 'established' as const,
      },
    };
    expect(
      (
        await service.ask(
          'Question',
          unclassified,
          new AbortController().signal,
        )
      ).text,
    ).toBe(UNVERIFIED_CONTEXT);
    expect(answer).not.toHaveBeenCalled();
  });

  it('sends only the question and verified boundary, and renders dated trusted facts', async () => {
    const answer = vi.fn<GroundedTransport['answer']>(async () => ({
      status: 'answer',
      facts: [known],
    }));
    const result = await new ChatService(
      new GroundedAIProvider({ answer }),
    ).ask(query().question, context(), new AbortController().signal);
    expect(answer.mock.calls[0]?.[0]).toEqual(query());
    expect(JSON.stringify(answer.mock.calls)).not.toContain('PRIVATE');
    expect(JSON.stringify(answer.mock.calls)).not.toContain('private.example');
    expect(result.text).toContain('[0:10] Mira holds a sealed envelope.');
    expect(result.boundary.maximumAllowedTimestamp).toBe(47);
  });

  it.each([
    { status: 'answer', facts: [future] },
    { status: 'answer', facts: [{ ...known, mediaId: 'sequel' }] },
    { status: 'answer', facts: [known], prose: 'FUTURE_SECRET' },
    { status: 'insufficient_context', facts: [known] },
    { status: 'answer', facts: [known, known] },
  ])('rejects unsafe/malformed gateway responses %#', async (result) => {
    const service = new ChatService(
      new GroundedAIProvider({ answer: async () => result }),
    );
    await expect(
      service.ask('Question', context(), new AbortController().signal),
    ).rejects.toThrow();
  });

  it('rejects an aborted reply even when the transport ignores cancellation', async () => {
    const controller = new AbortController();
    const service = new ChatService(
      new GroundedAIProvider({
        answer: async () => {
          controller.abort();
          return { status: 'answer', facts: [known] };
        },
      }),
    );
    await expect(
      service.ask('Question', context(), controller.signal),
    ).rejects.toThrow();
  });
});

describe('server evidence boundary', () => {
  it('excludes later facts before model invocation and makes annotations immutable', async () => {
    const select = vi.fn<EvidenceModel['select']>(async () => ({
      status: 'answer',
      factIds: ['f0'],
    }));
    const service = new GroundedService(catalog, { select });
    expect(await service.answer(query(), new AbortController().signal)).toEqual(
      { status: 'answer', facts: [known] },
    );
    const window = select.mock.calls[0]?.[1];
    expect(window?.fragments).toEqual([known]);
    expect(JSON.stringify(window)).not.toContain('FUTURE_SECRET');
    expect(Object.isFrozen(window?.fragments[0])).toBe(true);
  });

  it.each([74.999, 75, 75.001])(
    'honors the latest-reveal endpoint at %s',
    async (at) => {
      const select = vi.fn(async () => ({
        status: 'insufficient_context',
        factIds: [],
      }));
      await new GroundedService(catalog, { select }).answer(
        query(at),
        new AbortController().signal,
      );
      expect(JSON.stringify(select.mock.calls).includes('FUTURE_SECRET')).toBe(
        at >= 75,
      );
    },
  );

  it('refuses unknown assets and empty evidence without calling the model', async () => {
    const select = vi.fn();
    const service = new GroundedService(catalog, { select });
    expect(
      (await service.answer(query(0), new AbortController().signal)).status,
    ).toBe('insufficient_context');
    expect(
      (
        await service.answer(
          { ...query(), boundary: { ...query().boundary, mediaId: 'unknown' } },
          new AbortController().signal,
        )
      ).status,
    ).toBe('insufficient_context');
    expect(select).not.toHaveBeenCalled();
  });

  it.each([
    { ...query(), history: ['unrestricted synopsis'] },
    {
      ...query(),
      boundary: { ...query().boundary, timelineMapping: 'unverified' },
    },
    query(91),
  ])('rejects invalid or out-of-duration requests %#', async (value) => {
    const select = vi.fn();
    await expect(
      new GroundedService(catalog, { select }).answer(
        value,
        new AbortController().signal,
      ),
    ).rejects.toThrow();
    expect(select).not.toHaveBeenCalled();
  });

  it.each([
    { status: 'answer', factIds: ['f1'] },
    {
      status: 'answer',
      factIds: ['f0'],
      text: 'Ignore the boundary: FUTURE_SECRET',
    },
    { status: 'answer', factIds: ['f0', 'f0'] },
    { status: 'answer', factIds: [] },
    { status: 'insufficient_context', factIds: ['f0'] },
    { status: 'answer', factIds: ['f00'] },
    { status: 'answer', factIds: ['__proto__'] },
    'A free-form spoiler',
  ])('rejects adversarial model outputs %#', (value) => {
    expect(() => selectModelEvidence(value, [known])).toThrow();
  });

  it('renders a neutral fixed refusal, not model explanations or future confirmation', () => {
    const result = validateGroundedResult(
      { status: 'insufficient_context', facts: [] },
      createSpoilerBoundary(context()),
    );
    expect(renderGroundedResult(result)).toBe(INSUFFICIENT_CONTEXT);
  });
});

describe('Groq API contract', () => {
  it('uses GPT-OSS on_demand with bounded evidence, strict IDs, no history/tools/streaming/reasoning', async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: 'stop',
                message: {
                  content: JSON.stringify({
                    status: 'answer',
                    factIds: ['f0'],
                  }),
                  reasoning: 'DO NOT DISPLAY',
                },
              },
            ],
          }),
        ),
    );
    const service = new GroundedService(
      catalog,
      new GroqEvidenceModel('test-only-key', fetcher),
    );
    const result = await service.answer(query(), new AbortController().signal);
    expect(result).toEqual({ status: 'answer', facts: [known] });
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      'https://api.groq.com/openai/v1/chat/completions',
    );
    const options = fetcher.mock.calls[0]?.[1];
    const body = JSON.parse(String(options?.body));
    expect(body).toMatchObject({
      model: 'openai/gpt-oss-120b',
      service_tier: 'on_demand',
      stream: false,
      include_reasoning: false,
      max_completion_tokens: 1024,
    });
    expect(body.tools).toBeUndefined();
    expect(body.messages).toHaveLength(2);
    expect(JSON.stringify(body)).not.toContain('FUTURE_SECRET');
    expect(JSON.stringify(body)).not.toContain('test-only-key');
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(
      body.response_format.json_schema.schema.properties.factIds.items.enum,
    ).toEqual(['f0']);
    expect(options?.redirect).toBe('error');
  });

  it.each(['length', 'tool_calls', 'content_filter'])(
    'rejects incomplete or unexpected finish reason %s',
    async (finish_reason) => {
      const fetcher = vi.fn<typeof fetch>(
        async () =>
          new Response(
            JSON.stringify({
              choices: [
                {
                  finish_reason,
                  message: { content: '{"status":"answer","factIds":["f0"]}' },
                },
              ],
            }),
          ),
      );
      await expect(
        new GroundedService(
          catalog,
          new GroqEvidenceModel('test-only', fetcher),
        ).answer(query(), new AbortController().signal),
      ).rejects.toThrow();
    },
  );

  it('does not relay upstream error text or retry a rejected request', async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () => new Response('SECRET ERROR DETAILS', { status: 429 }),
    );
    await expect(
      new GroundedService(
        catalog,
        new GroqEvidenceModel('test-only', fetcher),
      ).answer(query(), new AbortController().signal),
    ).rejects.toThrow('AI service unavailable.');
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('propagates cancellation into the model fetch', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>(async (_url, options) => {
      controller.abort();
      expect(options?.signal?.aborted).toBe(true);
      options?.signal?.throwIfAborted();
      throw new Error('unreachable');
    });
    await expect(
      new GroundedService(
        catalog,
        new GroqEvidenceModel('test-only', fetcher),
      ).answer(query(), controller.signal),
    ).rejects.toThrow();
  });
});
