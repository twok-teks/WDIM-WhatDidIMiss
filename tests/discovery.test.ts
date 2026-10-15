import { afterEach, describe, expect, it } from 'vitest';
import {
  discoverVideos,
  isPictureInPicture,
} from '../services/video/video-discovery';
import { VideoContextProvider } from '../services/video/video-context-provider';
import { MediaRegistry } from '../services/video/media-registry';
import { VideoDirectory } from '../services/video/video-directory';
import type { DetectedVideo, ListedVideo } from '../services/video/video-types';
import { playback, videoElement } from './helpers';

afterEach(() => {
  document.body.replaceChildren();
});

function candidate(id = 'first', tabId = 1, time = 47): ListedVideo {
  return {
    id,
    tabId,
    frameId: 0,
    tabTitle: 'Test tab',
    frameVersion: 1,
    label: id,
    context: { ...playback(time), media: { ...playback().media, id } },
    safetyRevision: 1,
    requestRevision: 1,
    visible: true,
    area: 10000,
    pictureInPicture: false,
    fullscreen: false,
    lastPlayedAt: 0,
  };
}

describe('deep player discovery', () => {
  it('finds nested open and accessible closed shadow roots, excluding the extension UI', () => {
    const host = document.createElement('div');
    const closedHost = document.createElement('div');
    const closed = closedHost.attachShadow({ mode: 'closed' });
    closed.append(videoElement());
    host.attachShadow({ mode: 'open' }).append(closedHost, videoElement());
    const widget = document.createElement('wdim-companion');
    widget.attachShadow({ mode: 'open' }).append(videoElement());
    document.body.append(host, widget, videoElement());
    const result = discoverVideos(document, (element) =>
      element === closedHost ? closed : element.shadowRoot,
    );
    expect(result.videos).toHaveLength(3);
    expect(result.roots).toHaveLength(3);
  });

  it('rescans late-attached roots and retains hidden paused videos for manual selection', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const source = new VideoContextProvider(document);
    source.start();
    try {
      const video = videoElement();
      video.style.display = 'none';
      host.attachShadow({ mode: 'open' }).append(video);
      await source.rescan();
      expect(source.getReport().videos).toHaveLength(1);
      expect(source.getSnapshot().context).toBeNull();
      expect(
        source.readVideo(source.getReport().videos[0]!.id)?.context.position
          .currentTimeSeconds,
      ).toBe(12);
    } finally {
      source.stop();
    }
  });

  it('reads PiP from the video shadow root instead of the retargeted document property', () => {
    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'closed' });
    const video = videoElement();
    root.append(video);
    document.body.append(host);
    Object.defineProperty(root, 'pictureInPictureElement', { value: video });
    expect(isPictureInPicture(video)).toBe(true);
  });

  it('tracks rewind revisions for every video, including unselected players', () => {
    const first = videoElement(47, 900);
    const second = videoElement(47, 200);
    document.body.append(first, second);
    const source = new VideoContextProvider(document);
    source.start();
    try {
      const entry = source.getReport().videos[1]!;
      second.currentTime = 10;
      second.dispatchEvent(new Event('seeking'));
      second.currentTime = 60;
      second.dispatchEvent(new Event('seeked'));
      expect(source.readVideo(entry.id)?.safetyRevision).toBe(
        entry.safetyRevision + 1,
      );
    } finally {
      source.stop();
    }
  });

  it('prioritizes picture-in-picture even when its source element is hidden', () => {
    const video = videoElement();
    video.style.display = 'none';
    document.body.append(video);
    Object.defineProperty(document, 'pictureInPictureElement', {
      configurable: true,
      value: video,
    });
    const source = new VideoContextProvider(document);
    source.start();
    try {
      expect(source.getReport().videos[0]?.pictureInPicture).toBe(true);
      expect(source.getSnapshot().context).not.toBeNull();
    } finally {
      source.stop();
      Object.defineProperty(document, 'pictureInPictureElement', {
        configurable: true,
        value: null,
      });
    }
  });
});

describe('cross-tab registry', () => {
  it('tags provenance, groups frames by tab title, separates private browsing, and removes disconnected frames', () => {
    const registry = new MediaRegistry();
    const frameVideo: DetectedVideo = candidate();
    registry.set(
      'top',
      { tabId: 1, frameId: 0, incognito: false },
      { pageTitle: 'Movie site', videos: [] },
    );
    registry.set(
      'embed',
      { tabId: 1, frameId: 9, incognito: false },
      { pageTitle: 'Player API', videos: [frameVideo] },
    );
    registry.set(
      'private',
      { tabId: 2, frameId: 0, incognito: true },
      { pageTitle: 'Private', videos: [candidate('private')] },
    );
    expect(registry.list(false)).toEqual([
      expect.objectContaining({
        id: 'first',
        tabId: 1,
        frameId: 9,
        tabTitle: 'Movie site',
      }),
    ]);
    expect(registry.find('private', false)).toBeUndefined();
    expect(registry.find('first', false)).toBe('embed');
    registry.remove('embed');
    expect(registry.list(false)).toEqual([]);
  });
});

describe('video selection and stale context', () => {
  it('holds the conversation player when another video plays, including removal, until explicitly released', () => {
    const directory = new VideoDirectory();
    const original = candidate();
    const other = {
      ...candidate('other'),
      context: { ...playback(), state: 'playing' as const },
    };
    directory.update(1, 1, [original]);
    directory.holdSelection();
    directory.update(2, 1, [original, other]);
    expect(directory.getSnapshot().selectedVideoId).toBe('first');
    expect(directory.getSnapshot().selectionMode).toBe('conversation');
    directory.update(3, 1, [other]);
    expect(directory.getSnapshot().selectedVideoId).toBe('first');
    expect(directory.getSnapshot().context).toBeNull();
    directory.releaseSelection();
    expect(directory.getSnapshot().selectedVideoId).toBe('other');
  });

  it('preserves cancellation across a fast ad break whose final content position is unchanged', () => {
    const directory = new VideoDirectory();
    directory.update(1, 1, [candidate()]);
    const before = directory.getSnapshot();
    directory.update(2, 1, [{ ...candidate(), requestRevision: 3 }]);
    expect(directory.getSnapshot().safetyRevision).toBe(before.safetyRevision);
    expect(directory.getSnapshot().requestRevision).toBeGreaterThan(
      before.requestRevision,
    );
  });

  it('limits auto to the current tab; explicit other-tab selection survives another player starting', () => {
    const directory = new VideoDirectory();
    const local = candidate();
    const remote = {
      ...candidate('remote', 2),
      context: {
        ...playback(),
        media: { ...playback().media, id: 'remote' },
        state: 'playing' as const,
      },
    };
    directory.update(1, 1, [local, remote]);
    expect(directory.getSnapshot().selectedVideoId).toBe('first');
    directory.select('remote');
    directory.update(2, 1, [{ ...local, pictureInPicture: true }, remote]);
    expect(directory.getSnapshot().selectedVideoId).toBe('remote');
  });

  it('does not silently fall back when a pinned player disappears', () => {
    const directory = new VideoDirectory();
    directory.update(1, 1, [candidate(), candidate('other')]);
    directory.select('first');
    const revision = directory.getSnapshot().safetyRevision;
    directory.update(2, 1, [candidate('other')]);
    expect(directory.getSnapshot().context).toBeNull();
    expect(directory.getSnapshot().selectedVideoId).toBe('first');
    expect(directory.getSnapshot().safetyRevision).toBeGreaterThan(revision);
    directory.select(null);
    expect(directory.getSnapshot().selectedVideoId).toBe('other');
  });

  it('keeps a rewind invalidation after fast-forward and ignores stale catalogs', () => {
    const directory = new VideoDirectory();
    directory.update(1, 1, [candidate()]);
    const before = directory.getSnapshot().safetyRevision;
    directory.update(3, 1, [
      { ...candidate('first', 1, 60), safetyRevision: 2 },
    ]);
    expect(directory.getSnapshot().safetyRevision).toBe(before + 1);
    directory.update(2, 1, [candidate('first', 1, 12)]);
    expect(directory.getSnapshot().context?.position.currentTimeSeconds).toBe(
      60,
    );
  });

  it('keeps an unresponsive player unavailable until its own frame reports again', () => {
    const directory = new VideoDirectory();
    directory.update(1, 1, [candidate()]);
    directory.select('first');
    directory.unavailable('Player did not respond.');
    directory.update(2, 1, [candidate(), candidate('other', 2)]);
    expect(directory.getSnapshot().context).toBeNull();
    expect(directory.getSnapshot().discoveryStatus).toBe('error');
    directory.update(3, 1, [{ ...candidate(), frameVersion: 3 }]);
    expect(directory.getSnapshot().context?.media.id).toBe('first');
  });

  it('clears context on worker disconnection and accepts a fresh registry generation', () => {
    const directory = new VideoDirectory();
    directory.update(50, 1, [candidate()]);
    directory.select('first');
    directory.disconnect();
    expect(directory.getSnapshot().context).toBeNull();
    directory.update(1, 1, [candidate()]);
    expect(directory.getSnapshot().context?.media.id).toBe('first');
  });
});
