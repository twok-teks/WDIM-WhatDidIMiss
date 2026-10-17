import { createId } from '../services/id';
import { useEffect, useRef, useState } from 'react';
import {
  boundaryStillAllowed,
  createSpoilerBoundary,
  type SpoilerBoundary,
  type KnowledgeFragment,
} from '../domain/spoilers/boundary';
import type { ChatService } from '../services/chat/chat-service';
import type { VideoContextSource } from '../services/video/video-context-provider';
import { canAsk } from '../domain/spoilers/playback';
import type { ContextOptions } from '../domain/spoilers/captions';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  boundary: SpoilerBoundary;
  sources?: readonly KnowledgeFragment[];
}

export function useChat(
  source: VideoContextSource,
  service: ChatService,
  revision: number,
  contextOptions: ContextOptions = { background: false, earlierWorks: false },
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    let requestRevision = source.getSnapshot().requestRevision;
    const unsubscribe = source.subscribe(() => {
      const next = source.getSnapshot();
      if (next.requestRevision !== requestRevision || !canAsk(next.context)) {
        pending.current?.abort();
        pending.current = null;
        setLoading(false);
        setError(null);
      }
      requestRevision = next.requestRevision;
    });
    return () => {
      unsubscribe();
      pending.current?.abort();
      pending.current = null;
    };
  }, [source]);

  const send = (question: string): boolean => {
    if (
      pending.current ||
      !question.trim() ||
      question.trim().length > 2000 ||
      !canAsk(source.getSnapshot().context)
    )
      return false;
    source.holdSelection?.();
    const requestRevision = source.getSnapshot().requestRevision;
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    setError(null);
    void (async () => {
      // Embedded and other-tab players must be queried in their owning frame.
      const snapshot = await source.read();
      if (
        controller.signal.aborted ||
        snapshot.safetyRevision !== revision ||
        snapshot.requestRevision !== requestRevision
      )
        return;
      if (!snapshot.context || !canAsk(snapshot.context)) {
        throw new Error('Playback position unavailable.');
      }
      const boundary = createSpoilerBoundary(snapshot.context);
      setMessages((previous) => [
        ...previous,
        {
          id: createId(),
          role: 'user',
          text: question.trim(),
          boundary,
        },
      ]);
      const answer = await service.ask(
        question,
        snapshot.context,
        controller.signal,
        contextOptions,
      );
      const latest = await source.read();
      if (
        !controller.signal.aborted &&
        latest.safetyRevision === revision &&
        latest.requestRevision === requestRevision &&
        canAsk(latest.context) &&
        boundaryStillAllowed(answer.boundary, latest.context)
      ) {
        setMessages((previous) => [
          ...previous,
          {
            id: createId(),
            role: 'assistant',
            text: answer.text,
            sources: answer.sources,
            boundary: answer.boundary,
          },
        ]);
      }
    })()
      .catch(() => {
        if (
          !controller.signal.aborted &&
          source.getSnapshot().safetyRevision === revision
        ) {
          setError(
            service.mode === 'mock'
              ? 'The local mock could not reply. Check the selected video, refresh videos, and send your question again.'
              : 'A verified answer is unavailable. Check the AI gateway and selected video, then try again.',
          );
        }
      })
      .finally(() => {
        if (pending.current === controller) {
          pending.current = null;
          setLoading(false);
        }
      });
    return true;
  };
  return { messages, loading, error, send };
}
