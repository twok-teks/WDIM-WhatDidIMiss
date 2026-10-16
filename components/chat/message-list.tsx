import { useEffect, useRef, useState } from 'react';
import { formatTimestamp } from '../../domain/media/types';
import type { ChatMessage } from '../../hooks/use-chat';
import { Icon } from '../ui/icon';

export function MessageList({
  messages,
  loading,
  open = true,
  mode = 'mock',
}: {
  messages: ChatMessage[];
  loading: boolean;
  open?: boolean;
  mode?: 'mock' | 'grounded';
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const [hasNew, setHasNew] = useState(false);
  useEffect(() => {
    if (atBottom.current && scroll.current)
      scroll.current.scrollTop = scroll.current.scrollHeight;
    else setHasNew(true);
  }, [messages.length, loading, open]);
  return (
    <div className="message-area">
      <div
        className="messages"
        ref={scroll}
        role="log"
        aria-label="Conversation"
        aria-live="polite"
        aria-relevant="additions"
        onScroll={() => {
          const element = scroll.current;
          if (element) {
            atBottom.current =
              element.scrollHeight - element.scrollTop - element.clientHeight <
              48;
            if (atBottom.current) setHasNew(false);
          }
        }}
      >
        {messages.map((message) => (
          <article
            className={`message message-${message.role}`}
            key={message.id}
          >
            <div className="message-meta">
              <span>
                {message.role === 'user' ? 'You' : 'WDIM'}
                {message.role === 'assistant' && mode === 'mock' && (
                  <span className="mock-label">MOCK</span>
                )}
              </span>
              <span>
                Through{' '}
                {formatTimestamp(message.boundary.maximumAllowedTimestamp)}
              </span>
            </div>
            <p>{message.text}</p>
          </article>
        ))}
        {loading && (
          <div className="thinking" role="status">
            <span className="thinking-dot" />
            Checking your playback context…
          </div>
        )}
      </div>
      {hasNew && (
        <button
          className="new-messages"
          onClick={() => {
            if (scroll.current)
              scroll.current.scrollTop = scroll.current.scrollHeight;
            atBottom.current = true;
            setHasNew(false);
          }}
        >
          New message <Icon name="chevron" size={14} />
        </button>
      )}
    </div>
  );
}
