import { useState } from 'react';
import { CONFIG } from '../../config';
import { formatMoney } from '../../engine/death';
import { wageFor, workSanityCostFor } from '../../engine/economy';
import { canWorkToday } from '../../engine/reducer';
import { UNLOCK_DIALOGUE, isUnlocked, unlockTierOf } from '../../engine/unlocks';
import { useGame } from '../../store';
import { VENUE_TIER, type VenueKind } from '../../types';
import { stockMarketValue } from '../../venues/stocks';
import { Icon } from '../components/Icon';
import { VENUE_CARDS } from '../venueCards';
import { LoanSharkScreen } from './LoanSharkScreen';
import { NbaScreen } from './NbaScreen';
import { ShopScreen } from './ShopScreen';
import { StocksScreen } from './StocksScreen';

const ACTION_LABEL = { WORK: '打工', REST: '休息', GAMBLE: '去了場子', NONE: '' } as const;

const TIER_HINT: Record<1 | 2, string> = { 1: '先向阿龍借一次錢', 2: '累計借款或在地下場輸夠多' };

export function ActionScreen() {
  const state = useGame((s) => s.state);
  const dispatch = useGame((s) => s.dispatch);
  const [panel, setPanel] = useState<'none' | 'loan' | 'stocks' | 'nba' | 'shop'>('none');

  if (panel === 'loan') return <LoanSharkScreen onClose={() => setPanel('none')} />;
  if (panel === 'shop') return <ShopScreen onClose={() => setPanel('none')} />;
  if (panel === 'stocks') return <StocksScreen onClose={() => setPanel('none')} />;
  if (panel === 'nba') return <NbaScreen onClose={() => setPanel('none')} />;

  const used = state.actionUsedToday;
  const sick = state.day <= state.workBlockedUntilDay;
  const stockValue = stockMarketValue(state);
  const pending = state.pendingUnlock;

  return (
    <main className="screen">
      {pending !== null && <UnlockDialog ids={pending} onAck={() => dispatch({ type: 'ACK_UNLOCK' })} />}

      <section className="card card-hero">
        <div className="hero-row">
          <h2>
            第 <span className="day-number">{state.day}</span> 天
          </h2>
          {used ? <span className="badge badge-dim">已{ACTION_LABEL[state.todayAction]}</span> : <span className="badge badge-gold">今晚要付 ${formatMoney(state.dailyExpense)}</span>}
        </div>
        {state.mode === 'daily' && <p className="muted small">今日挑戰 {state.dailyKey}</p>}
        {!used && <p className="muted small">選一個主行動。股票、NBA、阿龍隨時都能去。</p>}
        {sick && !used && (
          <p className="warn small">
            <Icon name="warning" size={12} /> 身體不舒服，今天不能打工。
          </p>
        )}
        {state.insiderTipDay === state.day && <p className="ok small">朋友說今天 NBA 有一場內線。</p>}
        {state.tilt && (
          <p className="danger small shake">
            <Icon name="warning" size={12} /> 你有點上頭。進場最低注是現金的 {Math.round(CONFIG.TILT_MIN_BET_RATIO * 100)}%，至少玩 {CONFIG.TILT_FORCED_HANDS} 局。
          </p>
        )}
        {state.daysMaxedOut > 0 && (
          <p className="danger small">
            <Icon name="loan" size={12} /> 阿龍給你 {Math.max(0, CONFIG.DEBT_DEADLINE_DAYS - state.daysMaxedOut)} 天把錢降到上限以下。
          </p>
        )}
      </section>

      <div className="action-grid">
        <button className="btn btn-big life-btn life-work" disabled={!canWorkToday(state)} onClick={() => dispatch({ type: 'WORK' })}>
          <Icon name="work" size={28} />
          <span className="btn-title">打工</span>
          <span className="btn-sub">
            +${formatMoney(wageFor(state))} · 精神 −{workSanityCostFor(state)}
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
          <span className="muted small">
            {state.unlockedVenues.filter((v) => VENUE_CARDS.some((c) => c.kind === v)).length} / {VENUE_CARDS.length} 已解鎖
          </span>
        </div>
        <div className="venue-grid">
          {VENUE_CARDS.map((v) => {
            const unlocked = isUnlocked(state, v.kind);
            const tier = VENUE_TIER[v.kind];
            return (
              <button
                key={v.kind}
                className={`venue-card ${unlocked ? '' : 'venue-locked'}`}
                style={{ '--accent': v.accent } as React.CSSProperties}
                disabled={used || !unlocked}
                onClick={() => dispatch({ type: 'ENTER_VENUE', venue: v.kind })}
              >
                <span className="venue-icon">
                  <Icon name={unlocked ? v.icon : 'lock'} size={26} />
                </span>
                <span className="venue-name">{unlocked ? v.name : '???'}</span>
                <span className="venue-ev">{unlocked ? v.ev : `第 ${tier} 層`}</span>
                <span className="venue-note">{unlocked ? v.note : tier === 1 || tier === 2 ? TIER_HINT[tier] : ''}</span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="spacer" />

      <nav className={`dock ${state.loanSharkGone ? 'dock-three' : 'dock-four'}`}>
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
        <button className="dock-item" onClick={() => setPanel('shop')}>
          <Icon name="cash" size={22} />
          <span>花錢</span>
          {(state.lends.length > 0 || state.property !== null || state.managed !== null) && <span className="dock-sub">有部位</span>}
        </button>
        {!state.loanSharkGone && (
          <button className={`dock-item dock-danger ${state.debt > 0 ? 'dock-alert' : ''}`} onClick={() => setPanel('loan')}>
            <Icon name="loan" size={22} />
            <span>阿龍</span>
            {state.debt > 0 && <span className="dock-sub">欠 ${formatMoney(state.debt)}</span>}
          </button>
        )}
      </nav>

      <button className="btn btn-primary btn-cta" onClick={() => dispatch({ type: 'END_DAY' })}>
        結束今天
      </button>
    </main>
  );
}

function UnlockDialog({ ids, onAck }: { ids: readonly VenueKind[] | readonly string[]; onAck: () => void }) {
  const tier = unlockTierOf(ids as VenueKind[]);
  const dialogue = UNLOCK_DIALOGUE[tier];
  const richNames: Record<string, string> = { lending: '放高利貸', managing: '代操', presale: '炒預售屋' };
  const names = [...VENUE_CARDS.filter((c) => ids.includes(c.kind)).map((c) => c.name), ...ids.filter((id) => id in richNames).map((id) => richNames[id])];
  return (
    <div className="modal-backdrop">
      <section className="card modal-card pop-in">
        <p className="muted small">{dialogue.speaker}</p>
        {dialogue.lines.map((line, i) => (
          <p key={i} className="big dialogue-line" style={{ animationDelay: `${i * 500}ms` }}>
            「{line}」
          </p>
        ))}
        <p className="gold small">解鎖：{names.join('、')}</p>
        <button className="btn btn-primary" onClick={onAck}>
          知道了
        </button>
      </section>
    </div>
  );
}
