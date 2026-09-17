import type { PlaybackContext } from '../../domain/media/types';
import {
  createSpoilerBoundary,
  filterAllowedKnowledge,
  type AllowedContextWindow,
  type SpoilerBoundary,
} from '../../domain/spoilers/boundary';

export interface ChatRequest {
  readonly question: string;
  readonly playback: PlaybackContext;
  readonly boundary: SpoilerBoundary;
  readonly allowedContext: AllowedContextWindow;
}

export interface AIProvider {
  answer(request: ChatRequest, signal: AbortSignal): Promise<string>;
}

export interface ChatAnswer {
  readonly text: string;
  readonly boundary: SpoilerBoundary;
}

export class ChatService {
  constructor(private provider: AIProvider) {}

  async ask(
    question: string,
    context: PlaybackContext,
    signal: AbortSignal,
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
    });
    const boundary = createSpoilerBoundary(playback);
    const request: ChatRequest = Object.freeze({
      question: trimmed,
      playback,
      boundary,
      // No retrieval in this milestone. Future retrieval must pass through this filter.
      allowedContext: filterAllowedKnowledge(boundary, []),
    });
    signal.throwIfAborted();
    const text = await this.provider.answer(request, signal);
    signal.throwIfAborted();
    return Object.freeze({ text, boundary });
  }
}
