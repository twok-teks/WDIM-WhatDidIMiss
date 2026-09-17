import { createId } from '../services/id';
import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import {
  MediaRegistry,
  type FrameOwner,
} from '../services/video/media-registry';
import {
  MEDIA_PORT,
  UI_PORT,
  RESCAN_MESSAGE,
  isMessage,
  type ClientMessage,
  type ServerMessage,
} from '../services/video/messages';

type Port = ReturnType<typeof browser.runtime.connect>;

export default defineBackground(() => {
  const registry = new MediaRegistry();
  const connections = new Map<
    string,
    { port: Port; owner: FrameOwner; watching: boolean }
  >();
  const pending = new Map<
    string,
    {
      requester: Port;
      requestId: string;
      videoId: string;
      ownerKey: string;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  const post = (port: Port, message: ServerMessage) => {
    try {
      port.postMessage(message);
    } catch {
      /* A frame can unload between discovery and delivery. */
    }
  };
  const catalog = (owner: FrameOwner) => ({
    version: registry.version,
    tabId: owner.tabId,
    videos: registry.list(owner.incognito),
  });
  const broadcast = () => {
    for (const { port, owner, watching } of connections.values()) {
      if (watching) post(port, { type: 'catalog', ...catalog(owner) });
    }
  };
  const rescan = async (incognito: boolean): Promise<number> => {
    // Tab IDs and messaging do not need the sensitive "tabs" permission.
    const tabs = (await browser.tabs.query({})).filter(
      (tab) => !!tab.incognito === incognito && tab.id !== undefined,
    );
    const results = await Promise.allSettled(
      tabs.map((tab) =>
        browser.tabs.sendMessage(tab.id!, { type: RESCAN_MESSAGE }),
      ),
    );
    return results.filter((result) => result.status === 'rejected').length;
  };

  browser.runtime.onConnect.addListener((port) => {
    const sender = port.sender;
    if (
      (port.name !== MEDIA_PORT && port.name !== UI_PORT) ||
      (port.name === UI_PORT && sender?.frameId !== 0) ||
      sender?.id !== browser.runtime.id ||
      sender.tab?.id === undefined ||
      sender.frameId === undefined
    ) {
      port.disconnect();
      return;
    }
    const owner: FrameOwner = {
      tabId: sender.tab.id,
      frameId: sender.frameId,
      incognito: !!sender.tab.incognito,
    };
    const key = `${owner.tabId}:${owner.frameId}:${port.name}`;
    const collector = port.name === MEDIA_PORT;
    const old = connections.get(key);
    if (old) old.port.disconnect();
    registry.remove(key);
    const connection = { port, owner, watching: false };
    connections.set(key, connection);

    port.onMessage.addListener((value: unknown) => {
      if (connections.get(key) !== connection || !isMessage(value)) return;
      const message = value as ClientMessage;
      if (message.type === 'report' && collector) {
        registry.set(key, owner, message.report);
        broadcast();
      } else if (message.type === 'watch' && !collector) {
        connection.watching = true;
        post(port, { type: 'catalog', ...catalog(owner) });
        void rescan(owner.incognito).catch(() => {});
      } else if (message.type === 'rescan' && !collector) {
        void rescan(owner.incognito)
          .then((unavailableTabs) => {
            post(port, {
              type: 'rescan-result',
              requestId: message.requestId,
              unavailableTabs,
            });
          })
          .catch(() =>
            post(port, {
              type: 'rescan-result',
              requestId: message.requestId,
              unavailableTabs: 1,
            }),
          );
      } else if (message.type === 'read' && !collector) {
        const ownerKey = registry.find(message.videoId, owner.incognito);
        const target = ownerKey ? connections.get(ownerKey) : undefined;
        if (!ownerKey || !target) {
          post(port, {
            type: 'read-result',
            requestId: message.requestId,
            ...catalog(owner),
            error: 'Selected video is unavailable.',
          });
          return;
        }
        const requestId = createId();
        const timer = setTimeout(() => {
          pending.delete(requestId);
          post(port, {
            type: 'read-result',
            requestId: message.requestId,
            ...catalog(owner),
            error:
              'The video did not respond. Refresh videos or reload its tab.',
          });
        }, 2500);
        pending.set(requestId, {
          requester: port,
          requestId: message.requestId,
          videoId: message.videoId,
          ownerKey,
          timer,
        });
        post(target.port, {
          type: 'read',
          requestId,
          videoId: message.videoId,
        });
      } else if (message.type === 'read-result' && collector) {
        const request = pending.get(message.requestId);
        if (!request || request.ownerKey !== key) return;
        clearTimeout(request.timer);
        pending.delete(message.requestId);
        registry.set(key, owner, message.report);
        broadcast();
        const requester = [...connections.values()].find(
          (item) => item.port === request.requester,
        );
        if (requester)
          post(request.requester, {
            type: 'read-result',
            requestId: request.requestId,
            ...catalog(requester.owner),
            ...(!message.report.videos.some(
              (video) => video.id === request.videoId,
            )
              ? { error: 'Selected video was removed.' }
              : {}),
          });
      }
    });
    port.onDisconnect.addListener(() => {
      if (connections.get(key) !== connection) return;
      connections.delete(key);
      registry.remove(key);
      for (const [id, request] of pending) {
        if (request.requester === port) {
          clearTimeout(request.timer);
          pending.delete(id);
        }
      }
      broadcast();
    });
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    for (const [key, { port, owner }] of connections) {
      if (owner.tabId !== tabId) continue;
      connections.delete(key);
      registry.remove(key);
      port.disconnect();
      for (const [id, request] of pending) {
        if (request.requester === port) {
          clearTimeout(request.timer);
          pending.delete(id);
        }
      }
    }
    broadcast();
  });
});
