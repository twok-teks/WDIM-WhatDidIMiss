import type { PlaybackContext } from '../../domain/media/types';
import type { ContextOptions } from '../../domain/spoilers/captions';
import {
  createSpoilerBoundary,
  filterAllowedKnowledge,
  type AllowedContextWindow,
  type SpoilerBoundary,
} from '../../domain/spoilers/boundary';

export interface ChatRequest {
  readonly contextOptions?: ContextOptions;
  readonly question: string;
  readonly playback: PlaybackContext;
  readonly boundary: SpoilerBoundary;
  readonly allowedContext: AllowedContextWindow;
}

export interface AIProvider {
  readonly mode?: 'mock' | 'grounded';
  answer(request: ChatRequest, signal: AbortSignal): Promise<string>;
}

export interface ChatAnswer {
  readonly text: string;
  readonly boundary: SpoilerBoundary;
}

export class ChatService {
  constructor(private provider: AIProvider) {}

  get mode(): 'mock' | 'grounded' {
    return this.provider.mode ?? 'mock';
  }

  async ask(
    question: string,
    context: PlaybackContext,
    signal: AbortSignal,
    contextOptions: ContextOptions = { background: false, earlierWorks: false },
  ): Promise<ChatAnswer> {
    const trimmed = question.trim();
    if (!trimmed || trimmed.length > 2000)
      throw new Error('Use a question between 1 and 2,000 characters.');
    const playback: PlaybackContext = Object.freeze({
      ...context,
      media: Object.freeze({
        ...context.media,
        ...(context.media.release
          ? { release: Object.freeze({ ...context.media.release }) }
          : {}),
      }),
      position: Object.freeze({ ...context.position }),
      rawPosition: Object.freeze({ ...context.rawPosition }),
      timeline: Object.freeze({ ...context.timeline }),
      ...(context.captionStatus
        ? { captionStatus: Object.freeze({ ...context.captionStatus }) }
        : {}),
      ...(context.captionEvidence
        ? {
            captionEvidence: Object.freeze({
              mediaId: context.captionEvidence.mediaId,
              captions: Object.freeze(
                context.captionEvidence.captions.map((cue) =>
                  Object.freeze({ ...cue }),
                ),
              ),
            }),
          }
        : {}),
    });
    const boundary = createSpoilerBoundary(playback);
    const request: ChatRequest = Object.freeze({
      question: trimmed,
      contextOptions: Object.freeze({ ...contextOptions }),
      playback,
      boundary,
      // The opt-in gateway owns the curated catalog and filters it before model invocation.
      allowedContext: filterAllowedKnowledge(boundary, []),
    });
    signal.throwIfAborted();
    const text = await this.provider.answer(request, signal);
    signal.throwIfAborted();
    return Object.freeze({ text, boundary });
  }
}
