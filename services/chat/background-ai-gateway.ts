import { browser } from 'wxt/browser';
import { parseProviderQuery } from '../../domain/spoilers/provider-query';
import { AI_PORT } from './browser-grounded-transport';
import { readJson } from './read-json';

export function installAiGateway(enabled: boolean): void {
  let active = 0;
  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== AI_PORT) return;
    const sender = port.sender;
    // Only our authenticated top-frame UI can use this fixed endpoint. Private
    // browsing stays local; no page-selected URL, credentials, or arbitrary body.
    if (
      !enabled ||
      sender?.id !== browser.runtime.id ||
      sender.frameId !== 0 ||
      sender.tab?.id === undefined ||
      sender.tab.incognito ||
      active >= 2
    ) {
      port.disconnect();
      return;
    }
    const controller = new AbortController();
    let started = false;
    port.onDisconnect.addListener(() => controller.abort());
    port.onMessage.addListener((value: unknown) => {
      if (started || active >= 2) {
        controller.abort();
        port.disconnect();
        return;
      }
      started = true;
      active++;
      void (async () => {
        try {
          const query = parseProviderQuery(value);
          const response = await fetch('http://127.0.0.1:8787/v1/answer', {
            method: 'POST',
            credentials: 'omit',
            redirect: 'error',
            cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(query),
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(17000),
            ]),
          });
          const result = await readJson(response, 20000);
          controller.signal.throwIfAborted();
          port.postMessage({ type: 'answer', result });
        } catch {
          if (!controller.signal.aborted) {
            try {
              port.postMessage({ type: 'error' });
            } catch {
              /* UI disconnected. */
            }
          }
        } finally {
          active--;
        }
      })();
    });
  });
}
