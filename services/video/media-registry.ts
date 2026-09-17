import type { FrameReport, ListedVideo } from './video-types';

export interface FrameOwner {
  readonly tabId: number;
  readonly frameId: number;
  readonly incognito: boolean;
}

export class MediaRegistry {
  private frames = new Map<
    string,
    { owner: FrameOwner; report: FrameReport; frameVersion: number }
  >();
  version = 0;

  set(key: string, owner: FrameOwner, report: FrameReport): void {
    this.version++;
    this.frames.set(key, { owner, report, frameVersion: this.version });
  }

  remove(key: string): void {
    if (this.frames.delete(key)) this.version++;
  }

  find(id: string, incognito: boolean): string | undefined {
    for (const [key, frame] of this.frames) {
      if (
        frame.owner.incognito === incognito &&
        frame.report.videos.some((video) => video.id === id)
      )
        return key;
    }
  }

  list(incognito: boolean): ListedVideo[] {
    const frames = [...this.frames.values()].filter(
      (frame) => frame.owner.incognito === incognito,
    );
    return frames.flatMap(({ owner, report, frameVersion }) => {
      const title = frames.find(
        (frame) =>
          frame.owner.tabId === owner.tabId && frame.owner.frameId === 0,
      )?.report.pageTitle;
      return report.videos.map((video) => ({
        ...video,
        tabId: owner.tabId,
        frameId: owner.frameId,
        frameVersion,
        tabTitle: title || report.pageTitle || 'Untitled video tab',
      }));
    });
  }
}
