// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { CaptionService } from '../server/caption-service';
import { parseCaptionQuery } from '../domain/spoilers/captions';
import { validateCaptionResult } from '../domain/spoilers/caption-result';
import {
  renderGroundedResult,
  NO_EVIDENCE,
} from '../domain/spoilers/grounding';
import { parseAnswerClaims } from '../domain/spoilers/answer-claims';
import type { AnswerWriter } from '../server/answer-writer';

const query = parseCaptionQuery({
  kind: 'captions',
  question: 'Who did Khoai travel with?',
  boundary: {
    mediaId: 'session:one',
    maximumAllowedTimestamp: 47,
    durationSeconds: 90,
  },
  platform: 'youtube',
  assetId: 'youtube:abc',
  captions: [
    { text: 'Khoai: I am traveling with Tuan today.', observedAt: 10 },
  ],
  options: { background: false, earlierWorks: false },
});
const fact = {
  mediaId: 'session:one',
  revealedAtSeconds: 10,
  text: query.captions[0]!.text,
  source: {
    kind: 'caption' as const,
    label: 'Caption observed during playback',
  },
};
const claims = [{ text: 'Khoai is traveling with Tuan.', sourceIndexes: [0] }];
function setup(
  draft: unknown = { claims },
  review: unknown = { answersQuestion: true, supported: [true] },
) {
  const writer = {
    compose: vi.fn<AnswerWriter['compose']>(async () => draft),
    verify: vi.fn<AnswerWriter['verify']>(async () => review),
  };
  const model = {
    select: vi.fn(async () => ({ status: 'answer', factIds: ['f0'] })),
    writer,
  };
  return { ...writer, model, service: new CaptionService(model) };
}
describe('supported answer writing', () => {
  it('paraphrases a named speaker and preserves exact, bounded caption provenance', async () => {
    const { service, compose, verify } = setup();
    const result = await service.answer(query, new AbortController().signal);
    expect(renderGroundedResult(result)).toBe('Khoai is traveling with Tuan.');
    expect(result.facts).toEqual([fact]);
    expect(validateCaptionResult(result, query)).toEqual(result);
    for (const call of [compose.mock.calls[0]!, verify.mock.calls[0]!]) {
      expect(call[1].fragments).toEqual([fact]);
      expect(call[1].boundary.maximumAllowedTimestamp).toBe(47);
    }
  });
  it('never sends later evidence to selection, drafting or review', async () => {
    const { service, model, compose, verify } = setup();
    await expect(
      service.answer(
        {
          ...query,
          captions: [
            ...query.captions,
            { text: 'FUTURE_SECRET', observedAt: 48 },
          ],
        },
        new AbortController().signal,
      ),
    ).rejects.toThrow();
    expect(model.select).not.toHaveBeenCalled();
    expect(compose).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
  });
  it.each([
    { answersQuestion: true, supported: [false] },
    { answersQuestion: false, supported: [true] },
  ])(
    'withholds unsupported prose or an unsupported question premise',
    async (review) => {
      const { service } = setup(
        {
          claims: [
            {
              text: 'Khoai is traveling with FUTURE_SECRET.',
              sourceIndexes: [0],
            },
          ],
        },
        review,
      );
      const result = await service.answer(query, new AbortController().signal);
      expect(result).toEqual(NO_EVIDENCE);
      expect(JSON.stringify(result)).not.toContain('FUTURE_SECRET');
    },
  );
  it.each([
    { claims: [{ text: 'Spoiler', sourceIndexes: [9] }] },
    { claims: [{ text: 'Unsupported', sourceIndexes: [] }] },
    { claims: [{ text: 'Invented citation', sourceIndexes: [0, 0] }] },
    { claims: [{ text: 'See https://invented.example', sourceIndexes: [0] }] },
    {
      claims: [
        { text: 'Answer', sourceIndexes: [0], reasoning: 'Do not show' },
      ],
    },
    { claims, text: 'Unrestricted text' },
  ])('rejects malformed drafts before review %#', async (draft) => {
    const { service, verify } = setup(draft);
    await expect(
      service.answer(query, new AbortController().signal),
    ).rejects.toThrow();
    expect(verify).not.toHaveBeenCalled();
  });
  it.each([
    { answersQuestion: true, supported: [] },
    { answersQuestion: true, supported: ['true'] },
    { answersQuestion: true, supported: [true, true] },
    { answersQuestion: true, supported: [true], explanation: 'untrusted' },
  ])('fails closed on malformed support reviews %#', async (review) => {
    const { service } = setup({ claims }, review);
    await expect(
      service.answer(query, new AbortController().signal),
    ).rejects.toThrow();
  });
  it('does not review an empty draft and cancels a late review', async () => {
    const empty = setup({ claims: [] });
    expect(
      await empty.service.answer(query, new AbortController().signal),
    ).toEqual(NO_EVIDENCE);
    expect(empty.verify).not.toHaveBeenCalled();
    const controller = new AbortController();
    const late = setup();
    late.verify.mockImplementation(async () => {
      controller.abort();
      return { answersQuestion: true, supported: [true] };
    });
    await expect(
      late.service.answer(query, controller.signal),
    ).rejects.toThrow();
  });
  it('keeps external context labeled and rejects mixing its scope with current captions', () => {
    for (const kind of ['background', 'earlier-work'] as const) {
      const outside = {
        ...fact,
        text: 'A reviewed external fact.',
        source: {
          kind,
          label: 'Reviewed source',
          url: 'https://example.com/source',
        },
      };
      expect(() =>
        parseAnswerClaims(
          [{ text: 'Mixed inference.', sourceIndexes: [0, 1] }],
          [fact, outside],
        ),
      ).toThrow('Mixed');
      const value = {
        status: 'answer',
        facts: [outside],
        claims: [{ text: 'A natural external answer.', sourceIndexes: [0] }],
      };
      expect(() => validateCaptionResult(value, query)).toThrow();
      const result = validateCaptionResult(value, {
        ...query,
        options: { background: true, earlierWorks: true },
      });
      expect(renderGroundedResult(result)).toBe(
        `${kind === 'background' ? 'Background' : 'Earlier work'}: A natural external answer.`,
      );
    }
  });
});
