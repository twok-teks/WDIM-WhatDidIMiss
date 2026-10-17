import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { AnswerSources } from '../components/chat/answer-sources';

it('keeps captions and external evidence collapsed, then exposes original text and safe links', async () => {
  const user = userEvent.setup();
  render(
    <AnswerSources
      sources={[
        {
          mediaId: 'session',
          text: 'Original caption words.',
          revealedAtSeconds: 12,
          source: { kind: 'caption', label: 'Observed caption' },
        },
        {
          mediaId: 'session',
          text: 'Original reviewed background.',
          revealedAtSeconds: 15,
          source: {
            kind: 'background',
            label: 'Background source',
            url: 'https://example.com/background',
          },
        },
        {
          mediaId: 'session',
          text: 'Original earlier-film fact.',
          revealedAtSeconds: 15,
          source: {
            kind: 'earlier-work',
            label: 'Earlier film source',
            url: 'https://example.com/earlier',
          },
        },
      ]}
    />,
  );
  expect(screen.getByText('Original caption words.')).not.toBeVisible();
  screen.getByText('Sources (3)').focus();
  await user.keyboard('{Enter}');
  // jsdom does not implement summary keyboard activation; native behavior is
  // exercised in the browser test. Click here to inspect the revealed content.
  await user.click(screen.getByText('Sources (3)'));
  expect(screen.getByText('Original caption words.')).toBeVisible();
  expect(screen.getByText('Observed at 0:12')).toBeVisible();
  expect(screen.getByText('Outside background')).toBeVisible();
  expect(screen.getByText('Earlier work')).toBeVisible();
  const link = screen.getByRole('link', { name: /Earlier film source/ });
  expect(link).toHaveAttribute('href', 'https://example.com/earlier');
  expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  expect(link).toHaveAttribute('referrerpolicy', 'no-referrer');
  await user.click(screen.getByText('Sources (3)'));
  expect(screen.getByText('Original earlier-film fact.')).not.toBeVisible();
});
