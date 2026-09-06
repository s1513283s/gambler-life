import { useMemo } from 'react';

interface Props {
  /** 每次變動就重新噴一次；0 = 不顯示 */
  burst: number;
}

const COLORS = ['#f5c542', '#4ade80', '#60a5fa', '#f87171', '#f472b6', '#fbbf24'];
const COUNT = 42;

/** 純 CSS 彩帶，位置與延遲用 CSS 變數，key 換就重播。 */
export function Confetti({ burst }: Props) {
  const pieces = useMemo(
    () =>
      Array.from({ length: COUNT }, (_, i) => ({
        left: `${(i * 37) % 100}%`,
        delay: `${(i % 7) * 60}ms`,
        duration: `${1100 + (i % 5) * 160}ms`,
        color: COLORS[i % COLORS.length],
        rotate: `${(i * 53) % 360}deg`,
        drift: `${((i % 9) - 4) * 18}px`,
      })),
    [],
  );
  if (burst === 0) return null;
  return (
    <div className="confetti" key={burst} aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={
            {
              left: p.left,
              background: p.color,
              animationDelay: p.delay,
              animationDuration: p.duration,
              '--rot': p.rotate,
              '--drift': p.drift,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
