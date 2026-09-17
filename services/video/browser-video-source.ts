import { createId } from '../id';
import { browser } from 'wxt/browser';
import {
  MEDIA_PORT,
  UI_PORT,
  RESCAN_MESSAGE,
  isMessage,
  type ClientMessage,
  type ServerMessage,
} from './messages';
import { VideoDirectory } from './video-directory';
import type { VideoContextProvider } from './video-context-provider';
import type { VideoContextSource, VideoSnapshot } from './video-types';

type Port = ReturnType<typeof browser.runtime.connect>;

export class BrowserVideoSource implements VideoContextSource {
  private directory = new VideoDirectory();
  private port?: Port;
  private listeners = new Set<() => void>();
  private pending = new Map<
    string,
    {
      resolve(message: ServerMessage): void;
      reject(error: Error): void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private watching = false;
  private stopped = false;
  private started = false;
  private unsubscribe?: () => void;
  private retry?: ReturnType<typeof setTimeout>;

  constructor(private local?: VideoContextProvider) {}

  getSnapshot = (): VideoSnapshot => this.directory.getSnapshot();
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  start(): void {
    if (this.started) return;
    this.started = true;
    this.stopped = false;
    if (this.local) {
      this.local.start();
      this.unsubscribe = this.local.subscribe(() => this.publish());
      browser.runtime.onMessage.addListener(this.onRescan);
    }
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.started = false;
    clearTimeout(this.retry);
    this.unsubscribe?.();
    browser.runtime.onMessage.removeListener(this.onRescan);
    this.local?.stop();
    const port = this.port;
    this.port = undefined;
    port?.disconnect();
    this.rejectPending();
    this.directory.disconnect();
    this.emit();
  }

  activate = (): void => {
    if (!this.watching) {
      this.watching = true;
      const connected = !!this.port;
      this.connect();
      if (connected) this.post({ type: 'watch' });
    } else if (!this.port) this.connect();
  };

  selectVideo = (id: string | null): void => {
    this.directory.select(id);
    this.emit();
    if (this.getSnapshot().context) void this.read().catch(() => {});
  };

  read = async (): Promise<VideoSnapshot> => {
    const videoId = this.getSnapshot().selectedVideoId;
    if (!videoId) return this.getSnapshot();
    const selection = this.getSnapshot().safetyRevision;
    try {
      const result = await this.request({
        type: 'read',
        requestId: createId(),
        videoId,
      });
      if (result.type !== 'read-result')
        throw new Error('Unexpected video response.');
      if (result.error) throw new Error(result.error);
      return this.getSnapshot();
    } catch (error) {
      if (selection === this.getSnapshot().safetyRevision) {
        this.directory.unavailable(
          error instanceof Error ? error.message : 'Video context unavailable.',
        );
        this.emit();
      }
      throw error;
    }
  };

  rescan = async (): Promise<void> => {
    this.directory.status('refreshing');
    this.emit();
    this.connect();
    try {
      const result = await this.request({
        type: 'rescan',
        requestId: createId(),
      });
      this.directory.status(
        'ready',
        result.type === 'rescan-result' && result.unavailableTabs > 0
          ? 'Scan requested. Missing a player? Reload its page and check extension site access.'
          : 'Videos refreshed.',
      );
    } catch {
      this.directory.status(
        'error',
        'Could not refresh videos. Reload this page to reconnect the extension.',
      );
    }
    this.emit();
  };

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }

  private connect(): void {
    if (this.port || this.stopped) return;
    try {
      const port = browser.runtime.connect({
        name: this.local ? MEDIA_PORT : UI_PORT,
      });
      this.port = port;
      port.onMessage.addListener((value: unknown) => {
        if (this.port !== port || !isMessage(value)) return;
        this.onMessage(value as ServerMessage);
      });
      port.onDisconnect.addListener(() => {
        // Read lastError so an expected worker/frame shutdown does not produce an unchecked error.
        void browser.runtime.lastError;
        if (this.port !== port) return;
        this.port = undefined;
        this.rejectPending();
        this.directory.disconnect();
        this.emit();
        if (this.watching && !this.stopped)
          this.retry = setTimeout(() => this.connect(), 1000);
      });
      if (this.local)
        this.post({ type: 'report', report: this.local.getReport() });
      if (this.watching) this.post({ type: 'watch' });
    } catch {
      this.directory.unavailable(
        'Extension connection unavailable. Reload this page.',
      );
      this.emit();
    }
  }

  private publish(): void {
    if (!this.local) return;
    const connected = !!this.port;
    this.connect();
    if (connected)
      this.post({ type: 'report', report: this.local.getReport() });
  }

  private post(message: ClientMessage): void {
    try {
      this.port?.postMessage(message);
    } catch {
      /* Disconnect handling invalidates cached context. */
    }
  }

  private onRescan = (
    value: unknown,
    sender: { id?: string },
    respond: (response: unknown) => void,
  ): true | undefined => {
    if (
      !this.local ||
      !isMessage(value) ||
      value.type !== RESCAN_MESSAGE ||
      sender.id !== browser.runtime.id
    )
      return;
    void this.local
      .rescan()
      .then(() => {
        this.publish();
        respond({ ok: true });
      })
      .catch(() => respond({ ok: false }));
    return true;
  };

  private onMessage(message: ServerMessage): void {
    if (message.type === 'catalog' || message.type === 'read-result') {
      this.directory.update(message.version, message.tabId, message.videos);
      this.emit();
    }
    if (message.type === 'read' && this.local) {
      this.local.readVideo(message.videoId);
      this.post({
        type: 'read-result',
        requestId: message.requestId,
        report: this.local.getReport(),
      });
    } else if (message.type === 'rescan' && this.local) {
      void this.local.rescan().then(() => this.publish());
    } else if (
      message.type === 'read-result' ||
      message.type === 'rescan-result'
    ) {
      const request = this.pending.get(message.requestId);
      if (request) {
        clearTimeout(request.timer);
        this.pending.delete(message.requestId);
        request.resolve(message);
      }
    }
  }

  private request(
    message: Extract<
      ClientMessage,
      { requestId: string; type: 'read' | 'rescan' }
    >,
  ): Promise<ServerMessage> {
    this.connect();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(message.requestId);
        reject(new Error('Video discovery timed out. Try Refresh videos.'));
      }, 4000);
      this.pending.set(message.requestId, { resolve, reject, timer });
      this.post(message);
    });
  }

  private rejectPending(): void {
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error('Video connection was lost.'));
    }
    this.pending.clear();
  }
}
