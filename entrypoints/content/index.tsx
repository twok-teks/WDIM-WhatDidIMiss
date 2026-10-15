import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import { App } from '../../components/app';
import { ChatService } from '../../services/chat/chat-service';
import { MockAIProvider } from '../../services/chat/mock-ai-provider';
import { GroundedAIProvider } from '../../services/chat/grounded-ai-provider';
import { BrowserGroundedTransport } from '../../services/chat/browser-grounded-transport';
import { BrowserVideoSource } from '../../services/video/browser-video-source';
import { createPreferenceStorage } from '../../storage/preferences';
import '../../styles/widget.css';

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  allFrames: false,
  runAt: 'document_idle',
  cssInjectionMode: 'ui',
  async main(ctx) {
    const source = new BrowserVideoSource();
    source.start();
    ctx.onInvalidated(() => source.stop());
    ctx.addEventListener(window, 'pagehide', () => source.stop());
    ctx.addEventListener(window, 'pageshow', (event) => {
      if (event.persisted) source.start();
    });
    const mockOptions = { failNext: false };
    const aiEnabled = import.meta.env.WDIM_AI_MODE === 'groq';
    const service = new ChatService(
      aiEnabled
        ? new GroundedAIProvider(new BrowserGroundedTransport())
        : new MockAIProvider(mockOptions),
    );
    const preferences = createPreferenceStorage(browser.storage.local);
    const ui = await createShadowRootUi(ctx, {
      name: 'wdim-companion',
      position: 'inline',
      anchor: 'body',
      isolateEvents: [
        'keydown',
        'keyup',
        'keypress',
        'pointerdown',
        'pointerup',
        'click',
      ],
      onMount(container) {
        const mount = document.createElement('div');
        container.append(mount);
        const root = createRoot(mount);
        root.render(
          <App
            source={source}
            service={service}
            preferences={preferences}
            debug={
              import.meta.env.DEV && !aiEnabled
                ? {
                    failNext: () => {
                      mockOptions.failNext = true;
                    },
                  }
                : undefined
            }
          />,
        );
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });
    if (ctx.isInvalid) return;
    ui.mount();
    // A fullscreen container can host the widget. Native video/iframe fullscreen cannot.
    const syncFullscreen = () => {
      const fullscreen = document.fullscreenElement;
      const unsupported =
        fullscreen?.matches('video, iframe, embed, object') ?? false;
      ui.shadowHost.style.setProperty(
        'display',
        unsupported ? 'none' : 'block',
        'important',
      );
      const parent = fullscreen && !unsupported ? fullscreen : document.body;
      if (ui.shadowHost.parentElement !== parent) parent.append(ui.shadowHost);
    };
    syncFullscreen();
    ctx.addEventListener(document, 'fullscreenchange', syncFullscreen);
    ctx.onInvalidated(() => {
      ui.remove();
    });
    if (import.meta.env.DEV)
      console.info(
        '[WDIM] Content UI mounted. Developer context is inside the chat panel.',
      );
  },
});
