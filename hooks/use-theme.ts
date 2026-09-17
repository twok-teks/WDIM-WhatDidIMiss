import { useEffect, useRef, useState } from 'react';
import type { PreferenceStorage, Theme } from '../storage/preferences';

export function useTheme(storage: PreferenceStorage) {
  const [theme, setTheme] = useState<Theme>('dark');
  const [storageError, setStorageError] = useState(false);
  const changed = useRef(false);
  const writes = useRef(Promise.resolve());
  useEffect(() => {
    let active = true;
    void storage
      .getTheme()
      .then((value) => {
        if (active && !changed.current) setTheme(value);
      })
      .catch(() => {
        if (active) setStorageError(true);
      });
    return () => {
      active = false;
    };
  }, [storage]);
  const toggle = () => {
    changed.current = true;
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    // Serialize writes so quick toggles cannot persist an older preference last.
    writes.current = writes.current
      .then(() => storage.setTheme(next))
      .then(() => setStorageError(false))
      .catch(() => setStorageError(true));
  };
  return { theme, toggle, storageError };
}
