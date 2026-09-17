import {
  isComposedDescendant,
  isPictureInPicture,
  videoVisibility,
} from './video-discovery';

export function selectActiveVideo(
  videos: readonly HTMLVideoElement[],
  fullscreen: Element | null,
  lastPlayed: HTMLVideoElement | null,
): HTMLVideoElement | null {
  const candidates = videos
    .map((video) => ({
      video,
      ...videoVisibility(video),
      pip: isPictureInPicture(video),
      fullscreen: isComposedDescendant(fullscreen, video),
      playing: !video.paused && !video.ended,
      recent: video === lastPlayed,
    }))
    .filter((item) => item.visible || item.playing || item.pip);
  candidates.sort(
    (a, b) =>
      Number(b.pip) - Number(a.pip) ||
      Number(b.fullscreen) - Number(a.fullscreen) ||
      Number(b.playing) - Number(a.playing) ||
      Number(b.visible) - Number(a.visible) ||
      Number(b.recent) - Number(a.recent) ||
      b.area - a.area,
  );
  return candidates[0]?.video ?? null;
}
