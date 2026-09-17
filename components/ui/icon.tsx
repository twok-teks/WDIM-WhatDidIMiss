export type IconName =
  | 'chat'
  | 'close'
  | 'minus'
  | 'sun'
  | 'moon'
  | 'send'
  | 'shield'
  | 'chevron'
  | 'refresh';

const paths: Record<IconName, string> = {
  chat: 'M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-8l-6 3v-3a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z M8 9h8 M8 13h5',
  close: 'm6 6 12 12 M6 18 18 6',
  minus: 'M5 12h14',
  sun: 'M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1.5 1.5 M17.5 17.5 19 19 M5 19l1.5-1.5 M17.5 6.5 19 5 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  moon: 'M20 14a8 8 0 0 1-10-10 8 8 0 1 0 10 10Z',
  send: 'M12 19V5 M5 12l7-7 7 7',
  shield: 'm12 3 8 3v6c0 4-5 7-8 9-3-2-8-5-8-9V6l8-3Z m-4 9 3 3 5-6',
  chevron: 'm6 9 6 6 6-6',
  refresh:
    'M20 7v5h-5 M4 17v-5h5 M6 7a7 7 0 0 1 12-1l2 3 M4 15l2 3a7 7 0 0 0 12-1',
};

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
