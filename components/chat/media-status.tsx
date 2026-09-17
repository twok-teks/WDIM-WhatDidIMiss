import {
  formatTimestamp,
  type PlaybackContext,
} from '../../domain/media/types';

export function MediaStatus({ context }: { context: PlaybackContext | null }) {
  const status = !context
    ? 'No active video detected'
    : context.state === 'loading'
      ? 'Waiting for video'
      : context.state === 'playing'
        ? 'Playing'
        : context.state === 'ended'
          ? 'Ended'
          : 'Paused';
  return (
    <div className="media-status">
      <span className="playback-state">
        <span
          className={`status-dot ${context?.state === 'playing' ? 'is-playing' : ''}`}
        />
        {status}
      </span>
      {context && (
        <span className="timestamp" aria-label="Playback position">
          {formatTimestamp(context.position.currentTimeSeconds)}
          <span className="muted">
            {' '}
            / {formatTimestamp(context.position.durationSeconds)}
          </span>
        </span>
      )}
    </div>
  );
}
