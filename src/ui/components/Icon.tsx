export type IconName =
  | 'work'
  | 'rest'
  | 'baccarat'
  | 'blackjack'
  | 'crypto'
  | 'scratch'
  | 'nba'
  | 'stocks'
  | 'loan'
  | 'skull'
  | 'warning'
  | 'cash'
  | 'brain';

const PATHS: Record<IconName, string> = {
  work: 'M9 4h6a1 1 0 0 1 1 1v2h4a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4V5a1 1 0 0 1 1-1zm1 3h4V6h-4v1zm-6 5h16v-3H4v3zm0 2v4h16v-4h-5v1H9v-1H4z',
  rest: 'M12 3a9 9 0 1 0 9 9c0-.5 0-.9-.1-1.3A7 7 0 0 1 11.3 3.1c.2 0 .5-.1.7-.1zm-2.4 2.4A9 9 0 0 0 18.6 14.4 7 7 0 1 1 9.6 5.4z',
  baccarat: 'M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm1 2v15h10V8h-3V5H7zm5 4c1.7 0 3 1.4 3 3.2 0 1.9-3 4.8-3 4.8s-3-2.9-3-4.8C9 10.4 10.3 9 12 9z',
  blackjack: 'M12 2c2.5 3.5 7 6.8 7 10.6a4.4 4.4 0 0 1-6.3 4L14 21h-4l1.3-4.4a4.4 4.4 0 0 1-6.3-4C5 8.8 9.5 5.5 12 2z',
  crypto: 'M4 18l5-6 4 3 7-9v3l-7 9-4-3-5 6v-3zm0-8l5-6 4 3 4-5v3l-4 5-4-3-5 6V10z',
  scratch: 'M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V7zm4 2v6h10V9H7z',
  nba: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1.5 2.1v7.2H4.1a8 8 0 0 1 6.4-7.2zm3 0a8 8 0 0 1 6.4 7.2h-6.4V4.1zM4.1 12.7h6.4v7.2a8 8 0 0 1-6.4-7.2zm9.4 0h6.4a8 8 0 0 1-6.4 7.2v-7.2z',
  stocks: 'M4 20h16v2H2V2h2v18zm3-3v-6h3v6H7zm5 0V7h3v10h-3zm5 0v-4h3v4h-3z',
  loan: 'M12 2a8 8 0 0 0-8 8c0 3 1.6 5.6 4 7v3a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-3c2.4-1.4 4-4 4-7a8 8 0 0 0-8-8zM9 12a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm6 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm-3 4l-1.5-2h3L12 16z',
  skull: 'M12 2a8 8 0 0 0-8 8c0 3 1.6 5.6 4 7v3a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-3c2.4-1.4 4-4 4-7a8 8 0 0 0-8-8zM9 12a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm6 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm-3 4l-1.5-2h3L12 16z',
  warning: 'M12 2L1 21h22L12 2zm0 6l6.5 11h-13L12 8zm-1 4v4h2v-4h-2zm0 5v2h2v-2h-2z',
  cash: 'M2 6h20v12H2V6zm2 2v8h16V8H4zm8 1a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM5 9h2v2H5V9zm12 4h2v2h-2v-2z',
  brain: 'M9 3a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 1 5 3 3 0 0 0 4 3h2V3H9zm6 0a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-1 5 3 3 0 0 1-4 3h-2V3h2z',
};

interface Props {
  name: IconName;
  size?: number;
  className?: string;
}

/** 單色線條圖示，顏色跟隨 currentColor。 */
export function Icon({ name, size = 22, className = '' }: Props) {
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
