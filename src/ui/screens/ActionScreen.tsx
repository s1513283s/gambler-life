import { useState } from 'react';
import { CONFIG } from '../../config';
import { formatMoney } from '../../engine/death';
import { jobWage } from '../../engine/economy';
import { obsessionDef } from '../../engine/obsessions';
import { canWorkToday } from '../../engine/reducer';
import { UNLOCK_DIALOGUE, isUnlocked, unlockTierOf } from '../../engine/unlocks';
import { useGame } from '../../store';
import { VENUE_TIER, type JobId, type VenueKind } from '../../types';
import { stockMarketValue } from '../../venues/stocks';
import { Icon } from '../components/Icon';
import { RestModal, WorkModal } from '../components/WorkModal';
import { useScene } from '../sceneStore';
import { VENUE_CARDS } from '../venueCards';
import { LoanSharkScreen } from './LoanSharkScreen';
import { NbaScreen } from './NbaScreen';
import { ShopScreen } from './ShopScreen';
import { StocksScreen } from './StocksScreen';

const ACTION_LABEL = { WORK: '打工', REST: '休息', GAMBLE: '去了場子', NONE: '' } as const;

const TIER_HINT: Record<1 | 2 | 3, string> = { 1: '先向阿龍借一次錢', 2: '累計借款或在地下場輸夠多', 3: '淨值峰值 30 萬' };

/** 主行動的過場：先播畫面，播完才真的 dispatch */
type Overlay = { kind: 'work'; job: JobId; wage: number; sanityCost: number } | { kind: 'rest'; sanityGain: number } | null;

export function ActionScreen() {
  const state = useGame((s) => s.state);
  const dispatch = useGame((s) => s.dispatch);
  const [panel, setPanel] = useState<'none' | 'loan' | 'stocks' | 'nba' | 'shop'>('none');
  const [overlay, setOverlay] = useState<Overlay>(null);
  const transitionTo = useScene((s) => s.transitionTo);

  if (panel === 'loan') return <LoanSharkScreen onClose={() => setPanel('none')} />;
  if (panel === 'shop') return <ShopScreen onClose={() => setPanel('none')} />;
  if (panel === 'stocks') return <StocksScreen onClose={() => setPanel('none')} />;
  if (panel === 'nba') return <NbaScreen onClose={() => setPanel('none')} />;

  const used = state.actionUsedToday;
  const sick = state.day <= state.workBlockedUntilDay;
  const stockValue = stockMarketValue(state);
  const pending = state.pendingUnlock;
  const obsession = obsessionDef(state.obsession.id);
  const canFlee = state.debt >= CONFIG.LOAN_CAP * CONFIG.FLEE_DEBT_RATIO && state.cash >= CONFIG.FLEE_COST && !state.loanSharkGone;
  const vipOpen = isUnlocked(state, 'lending');
  const promised = state.promiseUntilDay >= state.day;

  // 打工先用同一個純函數算出薪資（外送的隨機值也用同一顆 rng），reducer 之後會算出一模一樣的數字
  const startWork = (job: JobId) => {
    if (!canWorkToday(state) || overlay !== null) return;
    const pay = jobWage(state, job);
    setOverlay({ kind: 'work', job, wage: pay.wage, sanityCost: Math.min(pay.sanityCost, state.sanity) });
  };
  const startRest = () => {
    if (used || overlay !== null) return;
    // 先記下實際會加多少（精神上限 100），dispatch 之後 state 已經變了
    setOverlay({ kind: 'rest', sanityGain: Math.min(CONFIG.REST_SANITY_GAIN, CONFIG.SANITY_MAX - state.sanity) });
  };
  // 百家樂是獨立的全螢幕牌桌，帶遮幕切過去
  const enterVenue = (venue: VenueKind, vip = false) => {
    if (venue === 'baccarat') transitionTo(() => dispatch({ type: 'ENTER_VENUE', venue, vip }));
    else dispatch({ type: 'ENTER_VENUE', venue, vip });
  };

  return (
    <main className="screen">
      {pending !== null && <UnlockDialog ids={pending} onAck={() => dispatch({ type: 'ACK_UNLOCK' })} />}
      {overlay?.kind === 'work' && (
        <WorkModal job={overlay.job} wage={overlay.wage} sanityCost={overlay.sanityCost} onCommit={() => dispatch({ type: 'WORK', job: overlay.job })} onDone={() => setOverlay(null)} />
      )}
      {overlay?.kind === 'rest' && <RestModal sanityGain={overlay.sanityGain} onCommit={() => dispatch({ type: 'REST' })} onDone={() => setOverlay(null)} />}

      <section className="card card-hero">
        <div className="hero-row">
          <h2>
            第 <span className="day-number">{state.day}</span> 天
          </h2>
          {used ? <span className="badge badge-dim">已{ACTION_LABEL[state.todayAction]}</span> : <span className="badge badge-gold">今晚要付 ${formatMoney(state.dailyExpense)}</span>}
        </div>
        {state.mode === 'daily' && <p className="muted small">今日挑戰 {state.dailyKey}</p>}
        <p className={`small obsession-line ${state.obsession.done ? 'ok' : 'muted'}`}>
          <Icon name="brain" size={12} /> 執念：{obsession.text}
          {state.obsession.done ? ' ✓' : ''}
        </p>
        {sick && !used && (
          <p className="warn small">
            <Icon name="warning" size={12} /> 身體不舒服，今天不能打工。
          </p>
        )}
        {promised && <p className="warn small">你答應過家人不進場子，到第 {state.promiseUntilDay} 天。</p>}
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
        {state.relations.familyGone && <p className="muted small">家人已經離開了。</p>}
        {state.relations.friendGone && <p className="muted small">阿明跑路了。</p>}
      </section>

      <section className="venue-section">
        <div className="section-head">
          <h2>打工</h2>
          <span className="muted small">選一種，一天一次</span>
        </div>
        <div className="job-grid">
          {CONFIG.JOBS.map((j) => {
            const pay = jobWage(state, j.id);
            const range = j.wageMax > j.wageMin;
            return (
              <button key={j.id} className={`btn job-btn job-${j.id}`} disabled={!canWorkToday(state) || overlay !== null} onClick={() => startWork(j.id as JobId)}>
                <Icon name="work" size={20} />
                <span className="btn-title">{j.name}</span>
                <span className="btn-sub">
                  {range ? `$${formatMoney(jobWage({ ...state, rngState: 0 }, j.id).wage)}±` : `$${formatMoney(pay.wage)}`} · 精神 −{pay.sanityCost}
                </span>
                <span className="job-blurb">{j.blurb}</span>
              </button>
            );
          })}
          <button className="btn job-btn life-rest" disabled={used || overlay !== null} onClick={startRest}>
            <Icon name="rest" size={20} />
            <span className="btn-title">休息</span>
            <span className="btn-sub">精神 +{CONFIG.REST_SANITY_GAIN}</span>
            <span className="job-blurb">什麼都不做</span>
          </button>
        </div>
      </section>

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
                onClick={() => enterVenue(v.kind)}
              >
                <span className="venue-icon">
                  <Icon name={unlocked ? v.icon : 'lock'} size={26} />
                </span>
                <span className="venue-name">{unlocked ? v.name : '???'}</span>
                <span className="venue-ev">{unlocked ? v.ev : `第 ${tier} 層`}</span>
                <span className="venue-note">{unlocked ? v.note : tier === 0 ? '' : TIER_HINT[tier]}</span>
              </button>
            );
          })}
          {vipOpen && (
            <button className="venue-card venue-vip" style={{ '--accent': '#ffe08a' } as React.CSSProperties} disabled={used} onClick={() => enterVenue('baccarat', true)}>
              <span className="venue-icon">
                <Icon name="baccarat" size={26} />
              </span>
              <span className="venue-name">VIP 百家樂</span>
              <span className="venue-ev">莊 EV −{(CONFIG.VIP_BANKER_EDGE * 100).toFixed(2)}%</span>
              <span className="venue-note">最低注 ${formatMoney(CONFIG.VIP_MIN_BET)}，抽水減半</span>
            </button>
          )}
        </div>
      </section>

      {canFlee && (
        <section className="card flee-card">
          <div className="hero-row">
            <div>
              <div className="shop-name">跑路</div>
              <div className="muted small">付 ${formatMoney(CONFIG.FLEE_COST)} 機票，帶著剩下的錢走。阿龍找不到你，但你也回不來了。</div>
            </div>
            <button className="btn btn-small" onClick={() => dispatch({ type: 'FLEE' })}>
              走
            </button>
          </div>
        </section>
      )}

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
