import type { Theme } from '../../storage/preferences';
import { Icon } from './icon';

export function ThemeToggle({
  theme,
  onToggle,
}: {
  theme: Theme;
  onToggle(): void;
}) {
  const label = `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`;
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={label}
      title={label}
      onClick={onToggle}
    >
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
    </button>
  );
}
