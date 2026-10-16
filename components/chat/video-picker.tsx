import { formatTimestamp } from '../../domain/media/types';
import type {
  VideoContextSource,
  VideoSnapshot,
} from '../../services/video/video-types';
import { Icon } from '../ui/icon';

export function VideoPicker({
  source,
  snapshot,
}: {
  source: VideoContextSource;
  snapshot: VideoSnapshot;
}) {
  if (!source.selectVideo || !source.rescan) return null;
  const videos = snapshot.videos ?? [];
  const groups = [...new Set(videos.map((video) => video.tabId))].sort(
    (a, b) =>
      Number(b === snapshot.currentTabId) -
        Number(a === snapshot.currentTabId) || a - b,
  );
  const manual = snapshot.selectionMode === 'manual';
  const held = snapshot.selectionMode === 'conversation';
  const unavailable =
    (manual || held) &&
    !videos.some((video) => video.id === snapshot.selectedVideoId);
  return (
    <>
      <div className="video-picker">
        <label htmlFor="wdim-video-source">Video</label>
        <select
          id="wdim-video-source"
          aria-label="Video source"
          value={manual || held ? (snapshot.selectedVideoId ?? '') : 'auto'}
          onChange={(event) =>
            source.selectVideo?.(
              event.target.value === 'auto' ? null : event.target.value,
            )
          }
        >
          <option value="auto">Automatic · this tab</option>
          {unavailable && (
            <option value={snapshot.selectedVideoId ?? ''}>
              Selected video unavailable
            </option>
          )}
          {groups.map((tabId) => {
            const tabVideos = videos.filter((video) => video.tabId === tabId);
            const title = tabVideos[0]?.tabTitle || 'Video tab';
            return (
              <optgroup
                key={tabId}
                label={`${tabId === snapshot.currentTabId ? 'This tab' : `Tab ${tabId}`} · ${title}`}
              >
                {tabVideos.map((video, index) => (
                  <option key={video.id} value={video.id}>
                    {index + 1}. {video.label}
                    {video.frameId !== 0 ? ' · Embedded' : ''}
                    {video.pictureInPicture
                      ? ' · Picture-in-picture'
                      : ''} · {video.context.state} ·{' '}
                    {formatTimestamp(video.context.position.currentTimeSeconds)}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
        <button
          type="button"
          className="icon-button"
          aria-label="Refresh videos"
          title="Rescan videos in all accessible tabs"
          disabled={snapshot.discoveryStatus === 'refreshing'}
          onClick={() => {
            void source.rescan?.();
          }}
        >
          <Icon name="refresh" size={15} />
        </button>
      </div>
      <div className="video-discovery-summary">
        <span>
          {snapshot.discoveryStatus === 'refreshing'
            ? 'Refreshing videos…'
            : `${videos.length} video${videos.length === 1 ? '' : 's'} · ${groups.length} tab${groups.length === 1 ? '' : 's'}`}
        </span>
        <span>
          {manual
            ? 'Selected manually'
            : held
              ? 'Kept for this conversation'
              : 'Auto · current tab'}
        </span>
      </div>
      {snapshot.discoveryNotice &&
        snapshot.discoveryStatus === 'ready' &&
        snapshot.context && (
          <p className="discovery-notice" role="status">
            {snapshot.discoveryNotice}
          </p>
        )}
    </>
  );
}
