import type { PlaybackContext } from '../domain/media/types';
import type {
  VideoContextSource,
  VideoSnapshot,
} from '../services/video/video-context-provider';

export function playback(seconds: number | null = 47): PlaybackContext {
  return {
    media: { id: 'movie-3', title: 'Test page', confidence: 'unverified' },
    position: { currentTimeSeconds: seconds, durationSeconds: 90 },
    state: seconds === null ? 'loading' : 'paused',
    pageTitle: 'Test page',
    pageUrl: 'http://localhost/',
  };
}

export function contextSource(context: PlaybackContext | null = playback()) {
  let snapshot: VideoSnapshot = {
    context,
    detectedVideoCount: context ? 1 : 0,
    adapterId: 'generic-html5',
    safetyRevision: 1,
  };
  const listeners = new Set<() => void>();
  const source: VideoContextSource & {
    update(context: PlaybackContext | null, invalidate?: boolean): void;
  } = {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    read: () => snapshot,
    update(next, invalidate = false) {
      snapshot = {
        ...snapshot,
        context: next,
        safetyRevision: snapshot.safetyRevision + Number(invalidate),
      };
      listeners.forEach((listener) => listener());
    },
  };
  return source;
}

export function videoElement(time = 12, width = 640): HTMLVideoElement {
  const video = document.createElement('video');
  video.style.opacity = '1';
  Object.defineProperties(video, {
    readyState: { configurable: true, value: 4 },
    duration: { configurable: true, value: 90 },
    paused: { configurable: true, value: true },
    ended: { configurable: true, value: false },
  });
  video.currentTime = time;
  video.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    bottom: 360,
    right: width,
    width,
    height: 360,
    toJSON: () => ({}),
  });
  return video;
}
