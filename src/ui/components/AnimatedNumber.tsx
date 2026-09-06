import { useEffect, useRef, useState } from 'react';
import { formatMoney } from '../../engine/death';

interface Props {
  value: number;
  /** 滾動時間，毫秒 */
  duration?: number;
  prefix?: string;
}

/** 數字從上一個值滾到新值，用 requestAnimationFrame，結束時精確落在目標。 */
export function AnimatedNumber({ value, duration = 500, prefix = '' }: Props) {
  const [shown, setShown] = useState(value);
  const fromRef = useRef(value);
  const frameRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    if (from === value) return;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = Math.round(from + (value - from) * eased);
      setShown(current);
      if (t < 1) frameRef.current = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [value, duration]);

  return (
    <span className="tabular">
      {prefix}
      {formatMoney(shown)}
    </span>
  );
}
