import { CONFIG } from '../../config';
import { formatMoney } from '../../engine/death';
import type { GameState } from '../../types';
import { stockMarketValue } from '../../venues/stocks';
import { AnimatedNumber } from './AnimatedNumber';

interface Props {
  state: GameState;
}

export function StatusBar({ state }: Props) {
  const sanityPct = (state.sanity / CONFIG.SANITY_MAX) * 100;
  const stockValue = stockMarketValue(state);
  const sanityTone = state.sanity < CONFIG.TILT_THRESHOLD ? 'danger' : state.sanity < CONFIG.TILT_EXIT ? 'warn' : 'ok';
  const low = state.sanity < CONFIG.TILT_THRESHOLD;

  return (
    <header className="statusbar">
      <div className="statusbar-row">
        <span className="statusbar-day">
          第 <span className="day-number">{state.day}</span> 天
        </span>
        <span className="statusbar-cash">
          <AnimatedNumber value={state.cash} prefix="$" />
        </span>
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
        <div className={`sanity-track ${low ? 'sanity-low' : ''}`}>
          <div className={`sanity-fill sanity-${sanityTone}`} style={{ width: `${sanityPct}%` }} />
        </div>
      </div>
    </header>
  );
}
