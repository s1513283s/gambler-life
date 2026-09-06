import { useState } from 'react';
import { CONFIG } from '../../config';
import { formatMoney } from '../../engine/death';
import { canWorkToday } from '../../engine/reducer';
import { useGame } from '../../store';
import type { VenueKind } from '../../types';
import { stockMarketValue } from '../../venues/stocks';
import { Icon, type IconName } from '../components/Icon';
import { LoanSharkScreen } from './LoanSharkScreen';
import { NbaScreen } from './NbaScreen';
import { StocksScreen } from './StocksScreen';

const ACTION_LABEL = { WORK: '打工', REST: '休息', GAMBLE: '去了場子', NONE: '' } as const;

interface VenueCard {
  kind: VenueKind;
  icon: IconName;
  name: string;
  ev: string;
  note: string;
  accent: string; // CSS 顏色，卡片微光
}

const VENUES: VenueCard[] = [
  {
    kind: 'baccarat',
    icon: 'baccarat',
    name: '百家樂',
    ev: `EV −${(CONFIG.BACCARAT_EDGE.banker * 100).toFixed(2)}%`,
    note: '慢慢輸的那種',
    accent: '#f5c542',
  },
  {
    kind: 'blackjack',
    icon: 'blackjack',
    name: '21 點',
    ev: `EV −${(CONFIG.BLACKJACK_BASE_EDGE * 100).toFixed(1)}% 起`,
    note: '打錯一次多送 1%',
    accent: '#e2c275',
  },
  {
    kind: 'crypto',
    icon: 'crypto',
    name: '幣圈合約',
    ev: `最高 ${CONFIG.CRYPTO_MAX_LEVERAGE}x`,
    note: '手續費在等你',
    accent: '#39ff9a',
  },
  {
    kind: 'scratch',
    icon: 'scratch',
    name: '刮刮樂',
    ev: `EV −${Math.round((1 - CONFIG.SCRATCH_RTP) * 100)}%`,
    note: '幾乎沒輸的錯覺',
    accent: '#ff3cac',
  },
];

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
      <section className="card card-hero">
        <div className="hero-row">
          <h2>今天做什麼</h2>
          {used && <span className="badge badge-dim">已{ACTION_LABEL[state.todayAction]}</span>}
        </div>
        {!used && <p className="muted small">選一個主行動。股票、NBA、阿龍隨時都能去。</p>}
        {sick && !used && (
          <p className="warn small">
            <Icon name="warning" size={12} /> 身體不舒服，今天不能打工。
          </p>
        )}
      </section>

      <div className="action-grid">
        <button className="btn btn-big life-btn life-work" disabled={!canWorkToday(state)} onClick={() => dispatch({ type: 'WORK' })}>
          <Icon name="work" size={28} />
          <span className="btn-title">打工</span>
          <span className="btn-sub">
            +${formatMoney(CONFIG.WAGE)} · 精神 −{CONFIG.WORK_SANITY_COST}
          </span>
        </button>
        <button className="btn btn-big life-btn life-rest" disabled={used} onClick={() => dispatch({ type: 'REST' })}>
          <Icon name="rest" size={28} />
          <span className="btn-title">休息</span>
          <span className="btn-sub">精神 +{CONFIG.REST_SANITY_GAIN}</span>
        </button>
      </div>

      <section className="venue-section">
        <div className="section-head">
          <h2>場子</h2>
          <span className="muted small">每個 EV 都是真的</span>
        </div>
        <div className="venue-grid">
          {VENUES.map((v) => (
            <button
              key={v.kind}
              className="venue-card"
              style={{ '--accent': v.accent } as React.CSSProperties}
              disabled={used}
              onClick={() => dispatch({ type: 'ENTER_VENUE', venue: v.kind })}
            >
              <span className="venue-icon">
                <Icon name={v.icon} size={26} />
              </span>
              <span className="venue-name">{v.name}</span>
              <span className="venue-ev">{v.ev}</span>
              <span className="venue-note">{v.note}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="spacer" />

      <nav className="dock">
        <button className="dock-item" onClick={() => setPanel('nba')}>
          <Icon name="nba" size={22} />
          <span>NBA</span>
          {state.nbaBets.length > 0 && <span className="dock-count">{state.nbaBets.length}</span>}
        </button>
        <button className="dock-item" onClick={() => setPanel('stocks')}>
          <Icon name="stocks" size={22} />
          <span>股票</span>
          {stockValue > 0 && <span className="dock-sub">${formatMoney(stockValue)}</span>}
        </button>
        <button className={`dock-item dock-danger ${state.debt > 0 ? 'dock-alert' : ''}`} onClick={() => setPanel('loan')}>
          <Icon name="loan" size={22} />
          <span>阿龍</span>
          {state.debt > 0 && <span className="dock-sub">欠 ${formatMoney(state.debt)}</span>}
        </button>
      </nav>

      <button className="btn btn-primary btn-cta" onClick={() => dispatch({ type: 'END_DAY' })}>
        結束今天
      </button>
    </main>
  );
}
