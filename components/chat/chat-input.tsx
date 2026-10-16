import { useState } from 'react';
import { Icon } from '../ui/icon';

export function ChatInput({
  canSend,
  loading,
  onSend,
}: {
  canSend: boolean;
  loading: boolean;
  onSend(question: string): boolean;
}) {
  const [draft, setDraft] = useState('');
  const submit = () => {
    if (canSend && !loading && draft.trim() && onSend(draft)) setDraft('');
  };
  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <textarea
        aria-label="Ask about what you've watched"
        aria-describedby="wdim-composer-help"
        placeholder="What did you miss?"
        value={draft}
        rows={2}
        maxLength={2000}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (
            event.key === 'Enter' &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing &&
            event.keyCode !== 229
          ) {
            event.preventDefault();
            submit();
          }
        }}
      />
      <div className="composer-bottom">
        <span id="wdim-composer-help">
          Enter to send <span aria-hidden="true">·</span> Shift + Enter for a
          new line
        </span>
        <button
          type="submit"
          className="send-button"
          aria-label="Send message"
          title="Send message (Enter). Shift + Enter for a new line."
          disabled={!canSend || loading || !draft.trim()}
        >
          <Icon name="send" size={17} />
        </button>
      </div>
    </form>
  );
}
