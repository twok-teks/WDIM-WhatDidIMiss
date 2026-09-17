import { useEffect, useRef } from 'react';
import { formatTimestamp } from '../../domain/media/types';
import { boundaryStillAllowed } from '../../domain/spoilers/boundary';
import { useChat } from '../../hooks/use-chat';
import type { ChatService } from '../../services/chat/chat-service';
import type {
  VideoContextSource,
  VideoSnapshot,
} from '../../services/video/video-context-provider';
import type { Theme } from '../../storage/preferences';
import { Icon } from '../ui/icon';
import { ThemeToggle } from '../ui/theme-toggle';
import { ChatInput } from './chat-input';
import { MediaStatus } from './media-status';
import { MessageList } from './message-list';
import { VideoPicker } from './video-picker';

interface ChatPanelProps {
  open: boolean;
  snapshot: VideoSnapshot;
  source: VideoContextSource;
  service: ChatService;
  theme: Theme;
  storageError: boolean;
  onToggleTheme(): void;
  onMinimize(): void;
  onClose(): void;
  debug?: { failNext(): void };
}

export function ChatPanel(props: ChatPanelProps) {
  const {
    open,
    snapshot,
    source,
    service,
    theme,
    storageError,
    onToggleTheme,
    onMinimize,
    onClose,
    debug,
  } = props;
  const { context } = snapshot;
  const { messages, loading, error, send } = useChat(
    source,
    service,
    snapshot.safetyRevision,
  );
  const panel = useRef<HTMLElement>(null);
  const knownTime = context?.position.currentTimeSeconds;
  const canSend =
    knownTime !== null &&
    knownTime !== undefined &&
    context?.state !== 'loading';
  // Render-time filtering backs up revision-based unmounting: unsafe messages never paint.
  const visibleMessages = messages.filter((message) =>
    boundaryStillAllowed(message.boundary, context),
  );
  useEffect(() => {
    if (open) panel.current?.querySelector('textarea')?.focus();
  }, [open]);

  return (
    <section
      className="chat-panel"
      ref={panel}
      hidden={!open}
      role="dialog"
      aria-modal="false"
      aria-label="What did I miss? Video companion"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onMinimize();
        }
      }}
    >
      <header className="panel-header">
        <div className="wordmark">
          <span className="brand-mark">
            <Icon name="chat" size={17} />
          </span>
          <div>
            <h1>What did I miss?</h1>
            <span className="header-caption">Your watching companion</span>
          </div>
        </div>
        <div className="header-actions">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <button
            type="button"
            className="icon-button"
            onClick={onMinimize}
            aria-label="Minimize chat"
            title="Minimize chat"
          >
            <Icon name="minus" size={16} />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close and clear chat"
            title="Close and clear chat"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      </header>
      <div className="video-context">
        <VideoPicker source={source} snapshot={snapshot} />
        <MediaStatus context={context} />
        {context && (
          <p className="page-title" title={context.pageTitle}>
            {context.pageTitle}
            <span>Page title · unverified</span>
          </p>
        )}
      </div>
      {visibleMessages.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">
            <Icon name="chat" size={25} />
          </span>
          <h2>
            A little context.
            <br />
            Back to the story.
          </h2>
          <p>
            {canSend
              ? "Ask about what you've watched so far."
              : 'Open a video on this page to get started.'}
          </p>
          <p className="boundary-hint">
            {canSend
              ? `Your boundary is ${formatTimestamp(knownTime)}. Nothing past this point.`
              : 'A known playback position is needed before you can send.'}
          </p>
          {canSend && (
            <div className="suggestions">
              <button onClick={() => send('What just happened?')}>
                What just happened?
              </button>
              <button onClick={() => send('Who is this character?')}>
                Who is this character?
              </button>
            </div>
          )}
        </div>
      ) : (
        <MessageList messages={visibleMessages} loading={loading} open={open} />
      )}
      {loading && visibleMessages.length === 0 && (
        <p className="thinking" role="status">
          Reading the selected video…
        </p>
      )}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {storageError && (
        <p role="status" className="error-message">
          Theme preference is unavailable. Changes may not persist.
        </p>
      )}
      <div className="panel-bottom">
        <ChatInput canSend={canSend} loading={loading} onSend={send} />
        <p className="privacy-note">
          <Icon name="shield" size={12} />
          Local mock · no story knowledge · nothing sent
        </p>
      </div>
      {debug && (
        <details className="debug">
          <summary>Developer context</summary>
          <pre>
            {JSON.stringify(
              {
                adapter: snapshot.adapterId,
                currentTime: context?.position.currentTimeSeconds,
                duration: context?.position.durationSeconds,
                pageTitle: context?.pageTitle,
                url: context?.pageUrl,
                videoCount: snapshot.detectedVideoCount,
                selectedVideo: snapshot.selectedVideoId,
                selectionMode: snapshot.selectionMode,
                discovery: snapshot.discoveryStatus,
                state: context?.state,
                safetyRevision: snapshot.safetyRevision,
              },
              null,
              2,
            )}
          </pre>
          <button onClick={debug.failNext}>Fail next mock reply</button>
        </details>
      )}
    </section>
  );
}
