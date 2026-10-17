import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { visibleDebugCaptions } from '../domain/spoilers/caption-debug';
import type {
  VideoContextSource,
  VideoSnapshot,
} from '../services/video/video-types';

function sameSession(a: VideoSnapshot, b: VideoSnapshot): boolean {
  return (
    a.selectedVideoId === b.selectedVideoId &&
    a.safetyRevision === b.safetyRevision &&
    a.requestRevision === b.requestRevision
  );
}

// Fresh authenticated selected-frame reads only; no provider call or persistent storage.
export function useCaptionDebug(source: VideoContextSource) {
  const current = useSyncExternalStore(source.subscribe, source.getSnapshot);
  const [captured, setCaptured] = useState<VideoSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const generation = useRef(0);
  const cancel = useCallback(() => {
    generation.current++;
  }, []);
  const refresh = useCallback(async () => {
    const token = ++generation.current;
    const before = source.getSnapshot();
    setLoading(true);
    setCaptured(null);
    setError(false);
    try {
      const fresh = await source.read();
      if (token !== generation.current) return;
      const latest = source.getSnapshot();
      if (
        !sameSession(before, fresh) ||
        !sameSession(fresh, latest) ||
        visibleDebugCaptions(fresh.context, latest.context) === null
      ) {
        setError(true);
        return;
      }
      setCaptured(fresh);
    } catch {
      if (token === generation.current) setError(true);
    } finally {
      if (token === generation.current) setLoading(false);
    }
  }, [source]);
  useEffect(() => {
    void refresh();
    return cancel;
  }, [refresh, cancel]);
  const captions =
    captured && sameSession(captured, current)
      ? visibleDebugCaptions(captured.context, current.context)
      : null;
  return {
    captions,
    time: captured?.context?.position.currentTimeSeconds ?? null,
    loading,
    error,
    refresh,
  };
}
