import { useState } from 'react';
import { CONFIG } from '../../config';
import { formatMoney } from '../../engine/death';
import { canWorkToday } from '../../engine/reducer';
import { useGame } from '../../store';
import { stockMarketValue } from '../../venues/stocks';
import { LoanSharkScreen } from './LoanSharkScreen';
import { NbaScreen } from './NbaScreen';
import { StocksScreen } from './StocksScreen';

const ACTION_LABEL = { WORK: '打工', REST: '休息', GAMBLE: '去了場子', NONE: '' } as const;

export function ActionScreen() {
  const state = useGame((s) => s.state);
  const dispatch = useGame((s) => s.dispatch);
  const [panel, setPanel] = useState<'none' | 'loan' | 'stocks' | 'nba'>('none');

  if (panel === 'loan') return <LoanSharkScreen onClose={() => setPanel('none')} />;
  if (panel === 'stocks') return <StocksScreen onClose={() => setPanel('none')} />;
  if (panel === 'nba') return <NbaScreen onClose={() => setPanel('none')} />;

  const used = state.actionUsedToday;
  const sick = state.day <= state.workBlockedUntilDay;
  const stockValue = stockMarketValue(state);

  return (
    <main className="screen">
      <section className="card">
        <h2>今天做什麼</h2>
        {used ? (
          <p className="muted">主行動已用掉（{ACTION_LABEL[state.todayAction]}）。</p>
        ) : (
          <p className="muted">選一個主行動。</p>
        )}
        {sick && !used && <p className="warn">身體不舒服，今天不能打工。</p>}
      </section>

      <div className="action-grid">
        <button className="btn btn-big" disabled={!canWorkToday(state)} onClick={() => dispatch({ type: 'WORK' })}>
          <span className="btn-title">打工</span>
          <span className="btn-sub">
            +${formatMoney(CONFIG.WAGE)}，精神 -{CONFIG.WORK_SANITY_COST}
          </span>
        </button>
        <button className="btn btn-big" disabled={used} onClick={() => dispatch({ type: 'REST' })}>
          <span className="btn-title">休息</span>
          <span className="btn-sub">精神 +{CONFIG.REST_SANITY_GAIN}</span>
        </button>
      </div>

      <section className="card">
        <h2>場子</h2>
        <div className="venue-row">
          <button className="btn venue-btn" disabled={used} onClick={() => dispatch({ type: 'ENTER_VENUE', venue: 'baccarat' })}>
            <span className="btn-title">百家樂</span>
            <span className="btn-sub">莊 -{(CONFIG.BACCARAT_EDGE.banker * 100).toFixed(2)}%</span>
          </button>
          <button className="btn venue-btn" disabled={used} onClick={() => dispatch({ type: 'ENTER_VENUE', venue: 'blackjack' })}>
            <span className="btn-title">21 點</span>
            <span className="btn-sub">打得好 -{(CONFIG.BLACKJACK_BASE_EDGE * 100).toFixed(1)}%</span>
          </button>
          <button className="btn venue-btn" disabled={used} onClick={() => dispatch({ type: 'ENTER_VENUE', venue: 'scratch' })}>
            <span className="btn-title">刮刮樂</span>
            <span className="btn-sub">-{Math.round((1 - CONFIG.SCRATCH_RTP) * 100)}%</span>
          </button>
          <button className="btn venue-btn" disabled={used} onClick={() => dispatch({ type: 'ENTER_VENUE', venue: 'crypto' })}>
            <span className="btn-title">幣圈合約</span>
            <span className="btn-sub">最高 {CONFIG.CRYPTO_MAX_LEVERAGE}x</span>
          </button>
        </div>
      </section>

      <div className="action-grid three">
        <button className="btn" onClick={() => setPanel('nba')}>
          今日 NBA{state.nbaBets.length > 0 ? `（${state.nbaBets.length} 張）` : ''}
        </button>
        <button className="btn" onClick={() => setPanel('stocks')}>
          股票{stockValue > 0 ? `（$${formatMoney(stockValue)}）` : ''}
        </button>
        <button className="btn" onClick={() => setPanel('loan')}>
          阿龍{state.debt > 0 ? `（欠 $${formatMoney(state.debt)}）` : ''}
        </button>
      </div>

      <div className="spacer" />
      <button className="btn btn-primary" onClick={() => dispatch({ type: 'END_DAY' })}>
        結束今天
      </button>
    </main>
  );
}
