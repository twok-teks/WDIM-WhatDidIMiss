import { defineContentScript } from 'wxt/utils/define-content-script';
import { BrowserVideoSource } from '../services/video/browser-video-source';
import { VideoContextProvider } from '../services/video/video-context-provider';
import { extensionShadowRoot } from '../services/video/extension-shadow-root';

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  allFrames: true,
  matchAboutBlank: true,
  matchOriginAsFallback: true,
  runAt: 'document_idle',
  main(ctx) {
    const source = new BrowserVideoSource(
      new VideoContextProvider(document, undefined, extensionShadowRoot),
    );
    source.start();
    ctx.onInvalidated(() => source.stop());
    ctx.addEventListener(window, 'pagehide', () => source.stop());
    ctx.addEventListener(window, 'pageshow', (event) => {
      if (event.persisted) source.start();
    });
  },
});
