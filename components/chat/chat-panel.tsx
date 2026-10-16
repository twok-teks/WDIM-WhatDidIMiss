import { useEffect, useRef, useState } from 'react';
import { boundaryStillAllowed } from '../../domain/spoilers/boundary';
import { canAsk } from '../../domain/spoilers/playback';
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
import { MessageList } from './message-list';
import { VideoDetails } from './video-details';

interface ChatPanelProps {
  open: boolean;
  detailsOpen: boolean;
  onDetailsChange(open: boolean): void;
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
    detailsOpen,
    onDetailsChange,
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
  const [background, setBackground] = useState(false);
  const [earlierWorks, setEarlierWorks] = useState(false);
  const { messages, loading, error, send } = useChat(
    source,
    service,
    snapshot.safetyRevision,
    { background, earlierWorks },
  );
  const panel = useRef<HTMLElement>(null);
  const canSend = canAsk(context);
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
          <h1>What did I miss?</h1>
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
      <VideoDetails
        open={detailsOpen}
        onOpenChange={onDetailsChange}
        source={source}
        snapshot={snapshot}
        grounded={service.mode === 'grounded'}
      >
        {service.mode === 'grounded' && (
          <details className="context-options">
            <summary>Related context</summary>
            <label>
              <input
                type="checkbox"
                checked={background}
                disabled={loading}
                onChange={(event) => setBackground(event.target.checked)}
              />{' '}
              Include sourced background about names already mentioned
            </label>
            <label>
              <input
                type="checkbox"
                checked={earlierWorks}
                disabled={loading}
                onChange={(event) => setEarlierWorks(event.target.checked)}
              />{' '}
              Include reviewed earlier works (may reveal their full plots)
            </label>
            <p className="boundary-hint">
              Background can look up a matching name on Wikidata. Earlier works
              require a verified relationship and release order in the source
              catalog. No unrestricted web or plot search.
            </p>
          </details>
        )}
      </VideoDetails>
      {visibleMessages.length === 0 ? (
        <div className="empty-state">
          <h2>Pick up the story.</h2>
          <p>
            {canSend
              ? "Ask about what you've watched so far."
              : context
                ? 'Tracking is suspended. Your video can keep playing.'
                : 'Open a video on this page to get started.'}
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
        <MessageList
          messages={visibleMessages}
          loading={loading}
          open={open}
          mode={service.mode}
        />
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
          {service.mode === 'mock' ? 'Local mock' : 'AI · no chat saved'}
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
                rawTime: context?.rawPosition.currentTimeSeconds,
                timeline: context?.timeline,
                duration: context?.position.durationSeconds,
                pageTitle: context?.pageTitle,
                url: context?.pageUrl,
                videoCount: snapshot.detectedVideoCount,
                selectedVideo: snapshot.selectedVideoId,
                selectionMode: snapshot.selectionMode,
                discovery: snapshot.discoveryStatus,
                state: context?.state,
                safetyRevision: snapshot.safetyRevision,
                requestRevision: snapshot.requestRevision,
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
