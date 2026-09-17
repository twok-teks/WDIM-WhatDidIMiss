import { browser } from 'wxt/browser';

// Public extension DOM APIs, with no page-world attachShadow patches.
export function extensionShadowRoot(element: HTMLElement): ShadowRoot | null {
  if (element.shadowRoot) return element.shadowRoot;
  if (typeof browser.dom?.openOrClosedShadowRoot === 'function') {
    return browser.dom.openOrClosedShadowRoot(element);
  }
  return (
    (element as HTMLElement & { openOrClosedShadowRoot?: ShadowRoot })
      .openOrClosedShadowRoot ?? null
  );
}
