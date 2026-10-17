import type { AllowedContextWindow } from '../domain/spoilers/boundary';
import { isRecord } from '../domain/spoilers/grounding';
import { readJson } from '../services/chat/read-json';

export function evidencePayload(
  question: string,
  window: AllowedContextWindow,
) {
  if (
    (window.boundary.timelineMapping !== 'verified' &&
      window.scope !== 'observed-captions') ||
    !window.fragments.length
  )
    throw new Error('Bounded evidence is required.');
  return {
    question,
    evidenceScope: window.scope ?? 'verified-story',
    boundary: {
      mediaId: window.boundary.mediaId,
      maximumAllowedTimestamp: window.boundary.maximumAllowedTimestamp,
    },
    evidence: window.fragments.map((fact, index) => ({
      id: `f${index}`,
      index,
      revealedAtSeconds: fact.revealedAtSeconds,
      text: fact.text,
      source: fact.source?.kind ?? 'story',
    })),
  };
}

export class GroqClient {
  constructor(
    private apiKey: string,
    private fetcher: typeof fetch = fetch,
  ) {
    if (!apiKey.trim())
      throw new Error('GROQ_API_KEY is required on the server.');
  }
  async complete(
    policy: string,
    input: unknown,
    name: string,
    schema: unknown,
    signal: AbortSignal,
  ): Promise<unknown> {
    signal.throwIfAborted();
    const response = await this.fetcher(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        redirect: 'error',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]),
        body: JSON.stringify({
          model: 'openai/gpt-oss-120b',
          service_tier: 'on_demand',
          reasoning_effort: 'low',
          include_reasoning: false,
          stream: false,
          max_completion_tokens: 1024,
          messages: [
            { role: 'system', content: policy },
            { role: 'user', content: JSON.stringify(input) },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: { name, strict: true, schema },
          },
        }),
      },
    );
    const body = await readJson(response);
    if (
      !isRecord(body) ||
      !Array.isArray(body.choices) ||
      body.choices.length !== 1
    )
      throw new Error('Invalid model response.');
    const choice: unknown = body.choices[0];
    if (
      !isRecord(choice) ||
      choice.finish_reason !== 'stop' ||
      !isRecord(choice.message) ||
      choice.message.tool_calls ||
      choice.message.refusal ||
      typeof choice.message.content !== 'string'
    )
      throw new Error('Model did not return a complete response.');
    signal.throwIfAborted();
    return JSON.parse(choice.message.content) as unknown;
  }
}
