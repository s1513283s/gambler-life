import { CONFIG } from '../../config';
import { formatMoney } from '../../engine/death';
import type { GameState } from '../../types';
import { stockMarketValue } from '../../venues/stocks';
import { AnimatedNumber } from './AnimatedNumber';
import { Icon } from './Icon';

interface Props {
  state: GameState;
}

type SanityTone = 'calm' | 'edgy' | 'tilt';

function sanityTone(state: GameState): SanityTone {
  if (state.tilt || state.sanity < CONFIG.TILT_THRESHOLD) return 'tilt';
  if (state.sanity < 50) return 'edgy';
  return 'calm';
}

const TONE_LABEL: Record<SanityTone, string> = { calm: '理智', edgy: '焦躁', tilt: '極度上頭 TILT' };

/** 頂部 HUD：現金、開銷、精神血條、債務與持股膠囊。 */
export function StatusBar({ state }: Props) {
  const pct = (state.sanity / CONFIG.SANITY_MAX) * 100;
  const tone = sanityTone(state);
  const stockValue = stockMarketValue(state);

  return (
    <header className="hud">
      <div className="hud-top">
        <div className="hud-day">
          <span className="hud-day-label">DAY</span>
          <span className="hud-day-number day-number">{state.day}</span>
        </div>
        <div className="hud-cash">
          <span className="hud-cash-label">
            <Icon name="cash" size={14} /> 現金
          </span>
          <span className="hud-cash-value">
            <AnimatedNumber value={state.cash} prefix="$" />
          </span>
          <span className="hud-expense">
            <Icon name="warning" size={11} /> 今日開銷 ${formatMoney(state.dailyExpense)}
          </span>
        </div>
      </div>

      <div className={`sanity sanity-${tone}`}>
        <div className="sanity-label">
          <span className="sanity-name">
            <Icon name="brain" size={13} /> 精神 {state.sanity}
          </span>
          <span className={`sanity-state sanity-state-${tone}`}>{tone === 'tilt' ? '⚠ ' : ''}[{TONE_LABEL[tone]}]</span>
        </div>
        <div className={`sanity-track ${tone === 'tilt' ? 'sanity-low' : ''}`}>
          <div className={`sanity-fill sanity-fill-${tone}`} style={{ width: `${pct}%` }} />
          <div className="sanity-ticks" />
        </div>
      </div>

      <div className="hud-badges">
        <span className={`badge ${state.debt > 0 ? 'badge-danger' : 'badge-dim'}`}>
          <Icon name="loan" size={12} /> 欠阿龍 ${formatMoney(state.debt)}
        </span>
        {stockValue > 0 && (
          <span className="badge badge-info">
            <Icon name="stocks" size={12} /> 持股 ${formatMoney(stockValue)}
          </span>
        )}
        {state.nbaBets.length > 0 && (
          <span className="badge badge-gold">
            <Icon name="nba" size={12} /> {state.nbaBets.length} 張待開
          </span>
        )}
      </div>
    </header>
  );
}
