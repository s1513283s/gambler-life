import { useEffect, useRef } from 'react';
import type { Candle } from '../../data/schema';

interface Line {
  price: number;
  color: string;
  label: string;
}

interface Props {
  candles: readonly Candle[];
  /** 畫到第幾根（含） */
  cursor: number;
  /** 總槽數，決定 x 軸尺度，讓圖不會隨播放一直重新縮放 */
  slots: number;
  lines: Line[];
}

const UP = '#4ade80';
const DOWN = '#f87171';

/** 只畫已揭露的 K，y 軸範圍只看已揭露部分，不洩漏未來。 */
export function CandleChart({ candles, cursor, slots, lines }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (canvas === null) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    if (ctx === null) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const shown = candles.slice(0, cursor + 1);
    if (shown.length === 0) return;

    let lo = Math.min(...shown.map((c) => c[2]), ...lines.map((l) => l.price));
    let hi = Math.max(...shown.map((c) => c[1]), ...lines.map((l) => l.price));
    const pad = Math.max((hi - lo) * 0.1, 5);
    lo -= pad;
    hi += pad;

    const padX = 6;
    const slotW = (w - padX * 2) / slots;
    const bodyW = Math.max(2, slotW * 0.6);
    const y = (p: number) => h - ((p - lo) / (hi - lo)) * h;
    const x = (i: number) => padX + i * slotW + slotW / 2;

    // 參考線
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    for (const line of lines) {
      ctx.strokeStyle = line.color;
      ctx.fillStyle = line.color;
      ctx.beginPath();
      ctx.moveTo(0, y(line.price));
      ctx.lineTo(w, y(line.price));
      ctx.stroke();
      ctx.fillText(line.label, w - 4, y(line.price) - 3);
    }
    ctx.setLineDash([]);

    shown.forEach((c, i) => {
      const [open, high, low, close] = c;
      const color = close >= open ? UP : DOWN;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x(i), y(high));
      ctx.lineTo(x(i), y(low));
      ctx.stroke();
      const top = y(Math.max(open, close));
      const bottom = y(Math.min(open, close));
      ctx.fillRect(x(i) - bodyW / 2, top, bodyW, Math.max(1, bottom - top));
    });
  }, [candles, cursor, slots, lines]);

  return <canvas ref={ref} className="candle-chart" />;
}
