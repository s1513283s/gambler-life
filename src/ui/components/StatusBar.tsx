import { useEffect, useRef, useState } from 'react';
import { CONFIG } from '../../config';
import { formatMoney } from '../../engine/death';
import type { GameState } from '../../types';
import { stockMarketValue } from '../../venues/stocks';

interface Props {
  state: GameState;
}

export function StatusBar({ state }: Props) {
  const sanityPct = (state.sanity / CONFIG.SANITY_MAX) * 100;
  const stockValue = stockMarketValue(state);
  const sanityTone = state.sanity < CONFIG.TILT_THRESHOLD ? 'danger' : state.sanity < CONFIG.TILT_EXIT ? 'warn' : 'ok';

  // 現金變動時閃一下顏色
  const prevCash = useRef(state.cash);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  useEffect(() => {
    const prev = prevCash.current;
    prevCash.current = state.cash;
    if (prev === state.cash) return;
    const dir = state.cash > prev ? 'up' : 'down';
    const timer = setTimeout(() => setFlash(dir), 0);
    const clear = setTimeout(() => setFlash(null), 500);
    return () => {
      clearTimeout(timer);
      clearTimeout(clear);
    };
  }, [state.cash]);

  return (
    <header className="statusbar">
      <div className="statusbar-row">
        <span className="statusbar-day">第 {state.day} 天</span>
        <span className={`statusbar-cash ${flash === 'up' ? 'cash-up' : flash === 'down' ? 'cash-down' : ''}`}>${formatMoney(state.cash)}</span>
      </div>
      <div className="statusbar-row statusbar-sub">
        <span>
          債務 {formatMoney(state.debt)}
          {stockValue > 0 ? ` · 持股 ${formatMoney(stockValue)}` : ''}
        </span>
        <span>今日開銷 {formatMoney(state.dailyExpense)}</span>
      </div>
      <div className="sanity">
        <div className="sanity-label">
          <span>精神 {state.sanity}</span>
          {state.tilt && <span className="tilt-tag">上頭</span>}
        </div>
        <div className="sanity-track">
          <div className={`sanity-fill sanity-${sanityTone}`} style={{ width: `${sanityPct}%` }} />
        </div>
      </div>
    </header>
  );
}
