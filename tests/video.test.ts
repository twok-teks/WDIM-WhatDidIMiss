import { afterEach, describe, expect, it, vi } from 'vitest';
import { VideoContextProvider } from '../services/video/video-context-provider';
import { selectActiveVideo } from '../services/video/video-detector';
import { videoElement } from './helpers';

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('active video selection', () => {
  it('prefers fullscreen, then playing/recent video, then visible area', () => {
    const large = videoElement(12, 800);
    const small = videoElement(12, 200);
    document.body.append(large, small);
    expect(selectActiveVideo([small, large], null, null)).toBe(large);
    Object.defineProperty(small, 'paused', {
      value: false,
      configurable: true,
    });
    expect(selectActiveVideo([large, small], null, small)).toBe(small);
    expect(selectActiveVideo([large, small], large, small)).toBe(large);
    small.style.display = 'none';
    expect(selectActiveVideo([small], null, small)).toBe(small);
    Object.defineProperty(small, 'paused', { value: true, configurable: true });
    expect(selectActiveVideo([small], null, small)).toBeNull();
  });
});

describe('video context lifecycle', () => {
  it('tracks metadata and state, invalidates backward seeking, and removes listeners on stop', () => {
    vi.useFakeTimers();
    const video = videoElement();
    document.body.append(video);
    const source = new VideoContextProvider(document);
    const listener = vi.fn();
    source.subscribe(listener);
    source.start();
    expect(source.getSnapshot().context?.position).toEqual({
      currentTimeSeconds: 12,
      durationSeconds: 90,
    });
    Object.defineProperty(video, 'paused', {
      configurable: true,
      value: false,
    });
    video.dispatchEvent(new Event('play'));
    expect(source.getSnapshot().context?.state).toBe('playing');
    video.currentTime = 47;
    video.dispatchEvent(new Event('seeked'));
    const revision = source.getSnapshot().safetyRevision;
    video.currentTime = 11.9;
    video.dispatchEvent(new Event('seeking'));
    expect(source.getSnapshot().safetyRevision).toBe(revision + 1);
    expect(source.getSnapshot().context?.position.currentTimeSeconds).toBe(
      11.9,
    );
    source.stop();
    const calls = listener.mock.calls.length;
    video.dispatchEvent(new Event('pause'));
    vi.advanceTimersByTime(1500);
    expect(listener).toHaveBeenCalledTimes(calls);
  });
  it('re-reads timing at send time and notices video removal, replacement, and unknown duration', () => {
    const video = videoElement();
    document.body.append(video);
    const source = new VideoContextProvider(document);
    source.start();
    try {
      video.currentTime = 33;
      Object.defineProperty(video, 'duration', {
        configurable: true,
        value: Infinity,
      });
      expect(source.read().context?.position).toEqual({
        currentTimeSeconds: 33,
        durationSeconds: null,
      });
      const revision = source.getSnapshot().safetyRevision;
      video.remove();
      expect(source.read().context).toBeNull();
      expect(source.getSnapshot().safetyRevision).toBe(revision + 1);
      document.body.append(videoElement());
      expect(source.read().context?.position.currentTimeSeconds).toBe(12);
    } finally {
      source.stop();
    }
  });
  it('keeps a stable snapshot when nothing changes and fails closed until metadata loads', () => {
    const video = videoElement();
    Object.defineProperty(video, 'readyState', {
      configurable: true,
      value: 0,
    });
    document.body.append(video);
    const source = new VideoContextProvider(document);
    source.start();
    try {
      const snapshot = source.getSnapshot();
      expect(snapshot.context?.position.currentTimeSeconds).toBeNull();
      expect(source.read()).toBe(snapshot);
    } finally {
      source.stop();
    }
  });
});
