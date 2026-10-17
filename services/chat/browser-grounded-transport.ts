import { browser } from 'wxt/browser';
import type { ProviderQuery } from '../../domain/spoilers/provider-query';
import { isRecord } from '../../domain/spoilers/grounding';
import type { GroundedTransport } from './grounded-ai-provider';

export const AI_PORT = 'wdim-grounded-ai-v1';

export class BrowserGroundedTransport implements GroundedTransport {
  answer(query: ProviderQuery, signal: AbortSignal): Promise<unknown> {
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
      const port = browser.runtime.connect({ name: AI_PORT });
      let done = false;
      const finish = (result?: unknown, error?: Error) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        port.onMessage.removeListener(message);
        port.onDisconnect.removeListener(disconnect);
        try {
          port.disconnect();
        } catch {
          /* Extension context was invalidated. */
        }
        if (error) reject(error);
        else resolve(result);
      };
      const abort = () =>
        finish(undefined, new DOMException('Canceled', 'AbortError'));
      const disconnect = () => {
        void browser.runtime.lastError;
        finish(undefined, new Error('AI gateway disconnected.'));
      };
      const message = (value: unknown) => {
        if (isRecord(value) && value.type === 'answer') finish(value.result);
        else finish(undefined, new Error('A verified answer is unavailable.'));
      };
      const timer = setTimeout(
        () => finish(undefined, new Error('AI gateway timed out.')),
        45000,
      );
      port.onMessage.addListener(message);
      port.onDisconnect.addListener(disconnect);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
      else {
        try {
          port.postMessage(query);
        } catch {
          disconnect();
        }
      }
    });
  }
}
