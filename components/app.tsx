import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTheme } from '../hooks/use-theme';
import type { ChatService } from '../services/chat/chat-service';
import type { VideoContextSource } from '../services/video/video-context-provider';
import type { PreferenceStorage } from '../storage/preferences';
import { ChatPanel } from './chat/chat-panel';
import { Icon } from './ui/icon';

export function App({
  source,
  service,
  preferences,
  debug,
}: {
  source: VideoContextSource;
  service: ChatService;
  preferences: PreferenceStorage;
  debug?: { failNext(): void };
}) {
  const snapshot = useSyncExternalStore(source.subscribe, source.getSnapshot);
  const { theme, toggle, storageError } = useTheme(preferences);
  const [open, setOpen] = useState(false);
  const [conversation, setConversation] = useState(0);
  const launcher = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) source.activate?.();
  }, [open, source]);
  const minimize = () => {
    setOpen(false);
    requestAnimationFrame(() => launcher.current?.focus());
  };
  return (
    <div className="wdim-root" data-theme={theme}>
      <ChatPanel
        key={`${snapshot.safetyRevision}:${conversation}`}
        open={open}
        snapshot={snapshot}
        source={source}
        service={service}
        theme={theme}
        storageError={storageError}
        onToggleTheme={toggle}
        onMinimize={minimize}
        onClose={() => {
          minimize();
          setConversation((value) => value + 1);
          source.releaseSelection?.();
        }}
        debug={debug}
      />
      {!open && (
        <button
          ref={launcher}
          type="button"
          className="launcher"
          onClick={() => setOpen(true)}
          aria-label="Open What did I miss?"
          aria-expanded={open}
          title="What did I miss?"
        >
          <Icon name="chat" size={19} />
          <span>WDIM</span>
          {snapshot.context?.state === 'playing' && (
            <span className="launcher-dot" />
          )}
        </button>
      )}
    </div>
  );
}
