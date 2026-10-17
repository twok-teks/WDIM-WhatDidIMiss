import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { CaptionDebug } from '../components/chat/caption-debug';
import { contextSource, playback } from './helpers';
import { visibleDebugCaptions } from '../domain/spoilers/caption-debug';
import type { VideoSnapshot } from '../services/video/video-types';

function captured() {
  return {
    ...playback(),
    captionEvidence: {
      mediaId: 'movie-3',
      captions: [
        { text: 'Nguyễn Văn An arrived.', observedAt: 10 },
        {
          text: 'A recovered subtitle.',
          observedAt: 20,
          origin: 'transcript' as const,
        },
        { text: 'FUTURE_SECRET', observedAt: 80 },
      ],
    },
  };
}

it('loads only when opened, searches captured text and refreshes without retaining content on close', async () => {
  const user = userEvent.setup();
  const source = contextSource(captured());
  const read = vi.spyOn(source, 'read');
  render(<CaptionDebug source={source} />);
  expect(read).not.toHaveBeenCalled();
  await user.click(screen.getByText('Caption debug'));
  expect(await screen.findByText('Nguyễn Văn An arrived.')).toBeVisible();
  expect(screen.getByText('Recovered · available by 0:20')).toBeVisible();
  expect(screen.queryByText('FUTURE_SECRET')).not.toBeInTheDocument();
  await user.type(screen.getByLabelText('Search captured captions'), 'Nguyen');
  expect(screen.getByText('Nguyễn Văn An arrived.')).toBeVisible();
  expect(screen.queryByText('A recovered subtitle.')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Refresh captions' }));
  await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
  await user.click(screen.getByText('Caption debug'));
  expect(screen.queryByText('Nguyễn Văn An arrived.')).not.toBeInTheDocument();
});

it('hides captured text immediately on rewind, context loss, and media change', async () => {
  const user = userEvent.setup();
  const source = contextSource(captured());
  render(<CaptionDebug source={source} />);
  await user.click(screen.getByText('Caption debug'));
  await screen.findByText('Nguyễn Văn An arrived.');
  act(() => source.update(playback(5), true));
  expect(screen.queryByText('Nguyễn Văn An arrived.')).not.toBeInTheDocument();
  expect(visibleDebugCaptions(captured(), null)).toBeNull();
  expect(
    visibleDebugCaptions(captured(), {
      ...playback(),
      media: { ...playback().media, id: 'other' },
    }),
  ).toBeNull();
  expect(visibleDebugCaptions(captured(), playback(null))).toBeNull();
});

it('rejects a delayed read from a previous selection', async () => {
  const user = userEvent.setup();
  const source = contextSource(captured());
  const old = source.getSnapshot();
  let finish!: (value: VideoSnapshot) => void;
  source.read = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  render(<CaptionDebug source={source} />);
  await user.click(screen.getByText('Caption debug'));
  act(() => source.update(playback(5), true));
  await act(async () => finish(old));
  expect(screen.queryByText('Nguyễn Văn An arrived.')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent(
    'unavailable or changed',
  );
});
