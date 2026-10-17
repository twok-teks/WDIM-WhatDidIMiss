import { formatTimestamp } from '../../domain/media/types';
import type { KnowledgeFragment } from '../../domain/spoilers/boundary';

export function AnswerSources({
  sources,
}: {
  sources: readonly KnowledgeFragment[];
}) {
  if (!sources.length) return null;
  return (
    <details className="answer-sources">
      <summary>Sources ({sources.length})</summary>
      <ol>
        {sources.map((fact, index) => (
          <li key={index}>
            <div className="source-meta">
              <span>
                {fact.source?.kind === 'caption'
                  ? fact.source.label === 'Subtitle track (cue end)'
                    ? 'Recovered subtitle'
                    : 'Caption'
                  : fact.source?.kind === 'background'
                    ? 'Outside background'
                    : fact.source?.kind === 'earlier-work'
                      ? 'Earlier work'
                      : 'Story evidence'}
              </span>
              <span>
                {fact.source?.kind === 'caption' &&
                fact.source.label !== 'Subtitle track (cue end)'
                  ? 'Observed at'
                  : 'Available by'}{' '}
                {formatTimestamp(fact.revealedAtSeconds)}
              </span>
            </div>
            <blockquote>{fact.text}</blockquote>
            {fact.source?.url && (
              <a
                href={fact.source.url}
                target="_blank"
                rel="noopener noreferrer"
                referrerPolicy="no-referrer"
              >
                {fact.source.label} ↗
              </a>
            )}
          </li>
        ))}
      </ol>
      {sources.some((fact) => fact.source?.url) && (
        <p className="source-warning">
          External pages may include information beyond your current position.
        </p>
      )}
    </details>
  );
}
