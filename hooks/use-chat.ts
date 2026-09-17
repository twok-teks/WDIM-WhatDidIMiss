import { createId } from '../services/id';
import { useEffect, useRef, useState } from 'react';
import {
  boundaryStillAllowed,
  createSpoilerBoundary,
  type SpoilerBoundary,
} from '../domain/spoilers/boundary';
import type { ChatService } from '../services/chat/chat-service';
import type { VideoContextSource } from '../services/video/video-context-provider';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  boundary: SpoilerBoundary;
}

export function useChat(
  source: VideoContextSource,
  service: ChatService,
  revision: number,
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  const send = (question: string): boolean => {
    if (pending.current || !question.trim() || question.trim().length > 2000)
      return false;
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    setError(null);
    void (async () => {
      // Embedded and other-tab players must be queried in their owning frame.
      const snapshot = await source.read();
      if (controller.signal.aborted || snapshot.safetyRevision !== revision)
        return;
      if (
        !snapshot.context ||
        snapshot.context.position.currentTimeSeconds === null
      ) {
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
      );
      const latest = await source.read();
      if (
        !controller.signal.aborted &&
        latest.safetyRevision === revision &&
        boundaryStillAllowed(answer.boundary, latest.context)
      ) {
        setMessages((previous) => [
          ...previous,
          {
            id: createId(),
            role: 'assistant',
            text: answer.text,
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
            'The local mock could not reply. Check the selected video, refresh videos, and send your question again.',
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          pending.current = null;
          setLoading(false);
        }
      });
    return true;
  };
  return { messages, loading, error, send };
}
