export type ShadowRootReader = (element: HTMLElement) => ShadowRoot | null;

export function discoverVideos(
  document: Document,
  shadowRoot: ShadowRootReader,
) {
  const videos: HTMLVideoElement[] = [];
  const roots: (Document | ShadowRoot)[] = [];
  const visit = (root: Document | ShadowRoot) => {
    roots.push(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode(node) {
        return (node as Element).localName === 'wdim-companion'
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT;
      },
    });
    let node = walker.nextNode();
    while (node) {
      if (node instanceof HTMLVideoElement) videos.push(node);
      // Do not inspect browser-owned controls or the extension's own shadow tree.
      else if (node instanceof HTMLElement) {
        const nested = shadowRoot(node);
        if (nested) visit(nested);
      }
      node = walker.nextNode();
    }
  };
  visit(document);
  return { videos, roots };
}

export function isComposedDescendant(
  parent: Element | null,
  element: Element,
): boolean {
  if (!parent) return false;
  let current: Node | null = element;
  while (current) {
    if (current === parent) return true;
    current =
      current.parentNode ??
      (current instanceof ShadowRoot ? current.host : null);
  }
  return false;
}

export function isPictureInPicture(video: HTMLVideoElement): boolean {
  // Document retargets this property to the host when PiP is inside a shadow tree.
  const root = video.getRootNode();
  return (
    (root instanceof ShadowRoot ? root : video.ownerDocument)
      .pictureInPictureElement === video
  );
}

export function videoVisibility(video: HTMLVideoElement) {
  const rect = video.getBoundingClientRect();
  const style = video.ownerDocument.defaultView?.getComputedStyle(video);
  return {
    area: Math.max(0, rect.width * rect.height),
    visible:
      rect.width >= 2 &&
      rect.height >= 2 &&
      style?.display !== 'none' &&
      style?.visibility !== 'hidden' &&
      style?.opacity !== '0',
  };
}
