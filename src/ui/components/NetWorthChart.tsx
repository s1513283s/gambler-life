import { formatMoney } from '../../engine/death';
import type { DayLog } from '../../types';

interface Props {
  history: readonly DayLog[];
  biggestLossDay: number;
}

/** 這一局的淨值走勢（現金減債務），標出最高點與最大單筆虧損那天。 */
export function NetWorthChart({ history, biggestLossDay }: Props) {
  if (history.length < 2) return null;
  const values = history.map((h) => h.cash - h.debt);
  const w = 360;
  const h = 120;
  const padX = 8;
  const padY = 14;
  const lo = Math.min(0, ...values);
  const hi = Math.max(...values);
  const x = (i: number) => padX + (i / (values.length - 1)) * (w - padX * 2);
  const y = (v: number) => (hi === lo ? h / 2 : padY + (1 - (v - lo) / (hi - lo)) * (h - padY * 2));
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const peakIdx = values.indexOf(hi);
  const lossIdx = history.findIndex((row) => row.day === biggestLossDay);
  const zeroY = y(0);
  const last = values[values.length - 1];

  return (
    <div className="worth-chart">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="worth-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f5c542" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#f5c542" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={padX} x2={w - padX} y1={zeroY} y2={zeroY} stroke="rgba(255,255,255,0.2)" strokeDasharray="3 3" />
        <path d={`${d} L${x(values.length - 1).toFixed(1)},${zeroY.toFixed(1)} L${x(0).toFixed(1)},${zeroY.toFixed(1)} Z`} fill="url(#worth-fill)" />
        <path d={d} fill="none" stroke={last >= 0 ? '#f5c542' : '#ff3b5c'} strokeWidth="2" className="worth-line" />
        <circle cx={x(peakIdx)} cy={y(hi)} r="4" fill="#39ff9a" />
        {lossIdx >= 0 && <circle cx={x(lossIdx)} cy={y(values[lossIdx])} r="4" fill="#ff3b5c" />}
      </svg>
      <div className="worth-legend">
        <span className="ok small">● 最高 ${formatMoney(hi)}，第 {history[peakIdx].day} 天</span>
        {lossIdx >= 0 && <span className="danger small">● 最慘一筆在第 {biggestLossDay} 天</span>}
      </div>
    </div>
  );
}
