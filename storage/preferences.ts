export type Theme = 'dark' | 'light';

export interface PreferenceStorage {
  getTheme(): Promise<Theme>;
  setTheme(theme: Theme): Promise<void>;
}

export interface StorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<unknown>;
}

export function createPreferenceStorage(area: StorageArea): PreferenceStorage {
  return {
    async getTheme() {
      const result = await area.get('theme');
      return result.theme === 'light' ? 'light' : 'dark';
    },
    async setTheme(theme) {
      await area.set({ theme });
    },
  };
}
