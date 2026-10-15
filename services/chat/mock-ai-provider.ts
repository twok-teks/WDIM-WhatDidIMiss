import { formatTimestamp } from '../../domain/media/types';
import type { AIProvider, ChatRequest } from './chat-service';

export class MockAIProvider implements AIProvider {
  constructor(private options: { delayMs?: number; failNext?: boolean } = {}) {}

  async answer(request: ChatRequest, signal: AbortSignal): Promise<string> {
    signal.throwIfAborted();
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      };
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', abort);
        resolve();
      }, this.options.delayMs ?? 550);
      signal.addEventListener('abort', abort, { once: true });
    });
    if (this.options.failNext) {
      this.options.failNext = false;
      throw new Error('Simulated provider failure');
    }
    const timing =
      request.boundary.timelineMapping === 'verified'
        ? `The allowed window is 0:00–${formatTimestamp(request.boundary.maximumAllowedTimestamp)} of this video. No previous movies are included.`
        : 'This is the player clock. Story timing is unverified, so no story facts are allowed.';
    return `Your question reached the local mock at ${formatTimestamp(request.boundary.maximumAllowedTimestamp)}.\n\n${timing}\n\nI don't have story knowledge yet, so I can't explain the scene.`;
  }
}
