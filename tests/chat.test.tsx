import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../components/app';
import { ChatInput } from '../components/chat/chat-input';
import { MessageList } from '../components/chat/message-list';
import { ChatService, type ChatRequest } from '../services/chat/chat-service';
import { MockAIProvider } from '../services/chat/mock-ai-provider';
import { createSpoilerBoundary } from '../domain/spoilers/boundary';
import { contextSource, playback } from './helpers';

function setup(context = playback()) {
  const source = contextSource(context);
  const answer = vi.fn(
    async (request: ChatRequest) =>
      `Boundary: ${request.boundary.maximumAllowedTimestamp}`,
  );
  const preferences = {
    getTheme: vi.fn(async () => 'dark' as const),
    setTheme: vi.fn(async () => {}),
  };
  render(
    <App
      source={source}
      service={new ChatService({ answer })}
      preferences={preferences}
    />,
  );
  return { source, answer, preferences, user: userEvent.setup() };
}

describe('chat input', () => {
  it('sends on Enter, keeps Shift+Enter newlines, and blocks empty/disabled submission', async () => {
    const user = userEvent.setup();
    const send = vi.fn(() => true);
    const { rerender } = render(
      <ChatInput canSend loading={false} onSend={send} />,
    );
    const input = screen.getByRole('textbox');
    await user.type(input, 'First{Shift>}{Enter}{/Shift}Second');
    expect(input).toHaveValue('First\nSecond');
    await user.keyboard('{Enter}');
    expect(send).toHaveBeenCalledWith('First\nSecond');
    expect(input).toHaveValue('');
    await user.keyboard('{Enter}');
    expect(send).toHaveBeenCalledTimes(1);
    rerender(<ChatInput canSend={false} loading={false} onSend={send} />);
    await user.type(input, 'Draft{Enter}');
    expect(send).toHaveBeenCalledTimes(1);
    expect(input).toHaveValue('Draft');
  });
  it('does not submit IME composition', () => {
    const send = vi.fn(() => true);
    render(<ChatInput canSend loading={false} onSend={send} />);
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'question' },
    });
    fireEvent.keyDown(screen.getByRole('textbox'), {
      key: 'Enter',
      isComposing: true,
    });
    expect(send).not.toHaveBeenCalled();
  });
});

describe('widget behavior', () => {
  it('shows context, sends a fresh snapshot, minimizes without clearing, and closes with clearing', async () => {
    const { user, source, answer } = setup();
    await user.click(
      screen.getByRole('button', { name: 'Open What did I miss?' }),
    );
    expect(screen.getByText('Paused')).toBeVisible();
    expect(screen.getByLabelText('Playback position')).toHaveTextContent(
      '0:47 / 1:30',
    );
    act(() => source.update(playback(52)));
    await user.type(screen.getByRole('textbox'), 'Explain{Enter}');
    await screen.findByText('Boundary: 52');
    expect(answer.mock.calls[0]?.[0].playback.position.currentTimeSeconds).toBe(
      52,
    );
    await user.click(screen.getByRole('button', { name: 'Minimize chat' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Open What did I miss?' }),
    );
    expect(screen.getByText('Boundary: 52')).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: 'Close and clear chat' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Open What did I miss?' }),
    );
    expect(screen.queryByText('Boundary: 52')).not.toBeInTheDocument();
  });
  it('disables sending and reports the no-video state honestly', async () => {
    const { source, user } = setup();
    act(() => source.update(null, true));
    await user.click(
      screen.getByRole('button', { name: 'Open What did I miss?' }),
    );
    expect(screen.getByText('No active video detected')).toBeVisible();
    await user.type(screen.getByRole('textbox'), 'Question');
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
  });
  it('switches theme, labels the next action, and persists preference', async () => {
    const { user, preferences } = setup();
    await user.click(
      screen.getByRole('button', { name: 'Open What did I miss?' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Switch to light mode' }),
    );
    await waitFor(() =>
      expect(preferences.setTheme).toHaveBeenCalledWith('light'),
    );
    expect(
      screen.getByRole('button', { name: 'Switch to dark mode' }),
    ).toBeVisible();
  });
  it('clears history on rewind and cancels an in-flight response even if playback advances again', async () => {
    const source = contextSource();
    let reply: ((value: string) => void) | undefined;
    const answer = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          reply = resolve;
        }),
    );
    const user = userEvent.setup();
    render(
      <App
        source={source}
        service={new ChatService({ answer })}
        preferences={{ getTheme: async () => 'dark', setTheme: async () => {} }}
      />,
    );
    await user.click(
      screen.getByRole('button', { name: 'Open What did I miss?' }),
    );
    await user.type(screen.getByRole('textbox'), 'Question at 47{Enter}');
    expect(screen.getByRole('status')).toHaveTextContent('Checking');
    act(() => source.update(playback(12), true));
    act(() => source.update(playback(60)));
    await act(async () => {
      reply?.('STALE REPLY');
    });
    expect(screen.queryByText('Question at 47')).not.toBeInTheDocument();
    expect(screen.queryByText('STALE REPLY')).not.toBeInTheDocument();
  });
  it('shows an error without claiming the mock answered, then recovers', async () => {
    const user = userEvent.setup();
    render(
      <App
        source={contextSource()}
        service={
          new ChatService(new MockAIProvider({ delayMs: 1, failNext: true }))
        }
        preferences={{ getTheme: async () => 'dark', setTheme: async () => {} }}
      />,
    );
    await user.click(
      screen.getByRole('button', { name: 'Open What did I miss?' }),
    );
    await user.type(screen.getByRole('textbox'), 'Question{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'could not reply',
    );
    await user.type(screen.getByRole('textbox'), 'Try again{Enter}');
    await screen.findByText(/Your question reached the local mock/);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('does not pull the reader down when they scrolled up', () => {
    const boundary = createSpoilerBoundary(playback());
    const messages = [
      { id: '1', role: 'user' as const, text: 'First', boundary },
    ];
    const { rerender } = render(
      <MessageList messages={messages} loading={false} />,
    );
    const log = screen.getByRole('log');
    Object.defineProperties(log, {
      scrollHeight: { configurable: true, value: 1000 },
      clientHeight: { configurable: true, value: 200 },
    });
    log.scrollTop = 100;
    fireEvent.scroll(log);
    rerender(
      <MessageList
        messages={[...messages, { ...messages[0]!, id: '2', text: 'Second' }]}
        loading={false}
      />,
    );
    expect(log.scrollTop).toBe(100);
    expect(screen.getByRole('button', { name: /New message/ })).toBeVisible();
  });
});
