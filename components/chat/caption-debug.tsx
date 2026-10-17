import { useState } from 'react';
import { formatTimestamp } from '../../domain/media/types';
import { normalizeTopic } from '../../domain/spoilers/topic';
import { useCaptionDebug } from '../../hooks/use-caption-debug';
import type { VideoContextSource } from '../../services/video/video-types';

export function CaptionDebug({ source }: { source: VideoContextSource }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="caption-debug" open={open}>
      <summary
        onClick={(event) => {
          event.preventDefault();
          setOpen(!open);
        }}
      >
        Caption debug
      </summary>
      {open && <CaptionInspector source={source} />}
    </details>
  );
}

function CaptionInspector({ source }: { source: VideoContextSource }) {
  const { captions, time, loading, error, refresh } = useCaptionDebug(source);
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const matches =
    captions
      ?.filter((cue) =>
        normalizeTopic(cue.text).includes(normalizeTopic(search)),
      )
      .slice()
      .reverse() ?? [];
  const page = matches.slice(offset, offset + 32);
  return (
    <div className="caption-inspector">
      <p className="boundary-hint">
        Local snapshot only; nothing sent to AI. Refresh to see newly captured
        captions.
      </p>
      <div className="caption-debug-controls">
        <input
          aria-label="Search captured captions"
          placeholder="Find a name or phrase…"
          maxLength={200}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setOffset(0);
          }}
        />
        <button
          type="button"
          disabled={loading}
          onClick={() => {
            setOffset(0);
            void refresh();
          }}
        >
          Refresh captions
        </button>
      </div>
      <p className="boundary-hint" role="status">
        {loading
          ? 'Reading captions…'
          : error || captions === null
            ? 'Caption snapshot unavailable or changed. Refresh to read the current video.'
            : `${captions.length} available through ${formatTimestamp(time)} · ${matches.length} matching · newest first`}
      </p>
      {!loading && captions !== null && (
        <>
          {!matches.length && (
            <p className="boundary-hint">
              {captions.length
                ? 'No matching captions.'
                : 'No captions captured yet. Turn on the player’s captions and let it play.'}
            </p>
          )}
          {!!page.length && (
            <ol className="caption-debug-list" aria-label="Captured captions">
              {page.map((cue, index) => (
                <li key={`${offset + index}:${cue.observedAt}`}>
                  <span>
                    {cue.origin === 'transcript'
                      ? 'Recovered · available by'
                      : 'Observed at'}{' '}
                    {formatTimestamp(cue.observedAt)}
                  </span>
                  <p>{cue.text}</p>
                </li>
              ))}
            </ol>
          )}
          {matches.length > 32 && (
            <div className="caption-debug-controls">
              <button
                type="button"
                disabled={!offset}
                onClick={() => setOffset(Math.max(0, offset - 32))}
              >
                Newer captions
              </button>
              <span>
                {offset + 1}–{Math.min(offset + 32, matches.length)} of{' '}
                {matches.length}
              </span>
              <button
                type="button"
                disabled={offset + 32 >= matches.length}
                onClick={() => setOffset(offset + 32)}
              >
                Older captions
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
