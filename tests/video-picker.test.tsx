import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { VideoPicker } from '../components/chat/video-picker';
import { contextSource, playback } from './helpers';

it('shows videos grouped across tabs, selects explicitly, restores auto, and rescans', async () => {
  const user = userEvent.setup();
  const source = {
    ...contextSource(),
    selectVideo: vi.fn(),
    rescan: vi.fn(async () => {}),
  };
  const base = {
    id: 'one',
    label: 'Embedded movie',
    context: playback(),
    safetyRevision: 1,
    visible: true,
    area: 100,
    pictureInPicture: false,
    fullscreen: false,
    lastPlayedAt: 0,
    tabId: 1,
    frameId: 2,
    tabTitle: 'First movie',
    frameVersion: 1,
  };
  render(
    <VideoPicker
      source={source}
      snapshot={{
        ...source.getSnapshot(),
        currentTabId: 1,
        selectionMode: 'auto',
        videos: [
          base,
          { ...base, id: 'two', tabId: 2, tabTitle: 'Second movie' },
        ],
      }}
    />,
  );
  expect(
    screen.getByRole('group', { name: 'This tab · First movie' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('group', { name: 'Tab 2 · Second movie' }),
  ).toBeInTheDocument();
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Video source' }),
    'two',
  );
  expect(source.selectVideo).toHaveBeenCalledWith('two');
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Video source' }),
    'auto',
  );
  expect(source.selectVideo).toHaveBeenCalledWith(null);
  await user.click(screen.getByRole('button', { name: 'Refresh videos' }));
  expect(source.rescan).toHaveBeenCalledOnce();
});
