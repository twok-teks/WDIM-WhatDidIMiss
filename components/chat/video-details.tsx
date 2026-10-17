import type { ReactNode } from 'react';
import { formatTimestamp } from '../../domain/media/types';
import type {
  VideoContextSource,
  VideoSnapshot,
} from '../../services/video/video-types';
import { Icon } from '../ui/icon';
import { MediaStatus } from './media-status';
import { VideoPicker } from './video-picker';
import { CaptionDebug } from './caption-debug';

export function VideoDetails({
  open,
  onOpenChange,
  source,
  snapshot,
  grounded,
  active,
  children,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  source: VideoContextSource;
  snapshot: VideoSnapshot;
  grounded: boolean;
  active: boolean;
  children?: ReactNode;
}) {
  const { context } = snapshot;
  const captions = grounded ? context?.captionStatus : undefined;
  return (
    <div className="video-context">
      <details className="video-details" open={open}>
        <summary
          aria-label="Video details"
          onClick={(event) => {
            event.preventDefault();
            onOpenChange(!open);
          }}
        >
          <span
            className="video-title"
            title={
              context
                ? `Page title (unverified): ${context.pageTitle}`
                : undefined
            }
          >
            {context?.pageTitle || 'Video details'}
          </span>
          <span className="details-toggle">
            Details <Icon name="chevron" size={13} />
          </span>
        </summary>
        <div className="video-details-body">
          <VideoPicker source={source} snapshot={snapshot} />
          {context && (
            <p className="boundary-hint">
              Page title · unverified.{' '}
              {context.timeline.mapping === 'unverified'
                ? 'Player time only; story timing and ads are not verified.'
                : 'Answers stay within the current story boundary.'}
            </p>
          )}
          {captions && (
            <p className="boundary-hint">
              {captions.recovery === 'available' ||
              captions.recovery === 'partial'
                ? `${captions.count} caption excerpts available through ${formatTimestamp(context?.position.currentTimeSeconds ?? null)}. Earlier subtitles can be recovered from this player; ${captions.recovery === 'partial' ? 'recovery limit reached or some cues unavailable' : 'the exposed track may be incomplete'}.`
                : captions.count
                  ? `${captions.count} caption excerpts observed since ${formatTimestamp(captions.since)}. Earlier scenes are not available.`
                  : 'Only captions displayed while WDIM is tracking are available.'}
              {captions.recovery === 'unavailable' &&
                ' This player does not expose a recoverable subtitle track.'}
            </p>
          )}
          {children}
          {grounded && active && open && <CaptionDebug source={source} />}
          <p className="boundary-hint">
            {grounded
              ? 'Groq AI uses observed captions or verified facts. No chat is saved.'
              : 'Local mock · no story knowledge · nothing sent'}
          </p>
        </div>
      </details>
      <MediaStatus context={context} />
      {captions?.state === 'waiting' && captions.count === 0 && (
        <p className="context-notice" role="status">
          Turn on captions and play to build context.
        </p>
      )}
      {snapshot.discoveryNotice &&
        (snapshot.discoveryStatus !== 'ready' || !context) && (
          <p className="context-notice" role="status">
            {snapshot.discoveryNotice}
          </p>
        )}
    </div>
  );
}
