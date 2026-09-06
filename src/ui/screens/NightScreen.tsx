import { CONFIG } from '../../config';
import { DEATH_CAUSE_LABEL, formatMoney } from '../../engine/death';
import { loanRoom } from '../../engine/economy';
import { eventDef } from '../../engine/events';
import { liquidationValue } from '../../engine/stockReducer';
import { useGame } from '../../store';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { StockList } from '../components/StockList';

function NightSky() {
  return (
    <div className="sky sky-night" aria-hidden="true">
      <div className="moon" />
      <div className="star s1" />
      <div className="star s2" />
      <div className="star s3" />
    </div>
  );
}

export function NightScreen() {
  const state = useGame((s) => s.state);
  const dispatch = useGame((s) => s.dispatch);
  const night = state.night;
  if (night === null) return null;

  if (night.step === 'EVENT') {
    const def = eventDef(night.event);
    const choosing = def.choices !== undefined && night.resultText === null;
    return (
      <main className="screen">
        <NightSky />
        <section className="card event-card pop-in">
          <h2>晚上</h2>
          <p className="big">{def.text}</p>
          {night.resultText !== null && <p className="event-result">{night.resultText}</p>}
        </section>
        <div className="spacer" />
        {choosing ? (
          <div className="choice-list">
            {def.choices?.map((c, i) => (
              <button
                key={i}
                className={`btn btn-choice ${(c.effects.cash ?? 0) < 0 && state.cash < -(c.effects.cash ?? 0) ? 'btn-choice-poor' : ''}`}
                disabled={(c.effects.cash ?? 0) < 0 && state.cash < -(c.effects.cash ?? 0)}
                onClick={() => dispatch({ type: 'NIGHT_CHOOSE', index: i })}
              >
                {c.label}
              </button>
            ))}
          </div>
        ) : (
          <button className="btn btn-primary" onClick={() => dispatch({ type: 'NIGHT_ACK_EVENT' })}>
            確認
          </button>
        )}
      </main>
    );
  }

  if (night.step === 'LIQUIDATE') {
    const covered = night.shortfall <= 0;
    const canBorrow = !state.loanSharkGone && loanRoom(state.debt) >= night.shortfall;
    return (
      <main className="screen">
        <section className="card">
          <h2>付不出開銷</h2>
          <div className="kv">
            <span className="muted">今晚要付</span>
            <span>${formatMoney(state.dailyExpense)}</span>
          </div>
          <div className="kv">
            <span className="muted">手上現金</span>
            <span>${formatMoney(state.cash)}</span>
          </div>
          <div className="kv">
            <span className="muted">{covered ? '已補足' : '還差'}</span>
            <span className={covered ? 'ok' : 'danger'}>${formatMoney(Math.max(0, night.shortfall))}</span>
          </div>
          <p className="muted small">持股全砍約可拿回 ${formatMoney(liquidationValue(state))}。砍倉一樣收手續費與證交稅。</p>
        </section>

        <StockList sellOnly />

        <div className="spacer" />
        <button className="btn btn-primary" onClick={() => dispatch({ type: 'NIGHT_SKIP_LIQUIDATE' })}>
          {covered ? '繼續結算' : canBorrow ? '不砍了，去找阿龍' : '不砍了（付不出來）'}
        </button>
      </main>
    );
  }

  return (
    <main className="screen">
      <NightSky />
      <section className="card">
        <h2>晚上</h2>
        <p className="big danger">
          -<AnimatedNumber value={night.expense} duration={900} prefix="$" />
        </p>
        <p className="muted small">今天的開銷。</p>
        {night.autoLoan > 0 && (
          <p className="warn">錢不夠，你又去找了阿龍，借了 ${formatMoney(night.autoLoan)}。</p>
        )}
        {night.interest > 0 && <p className="warn">利息滾了 ${formatMoney(night.interest)}。</p>}
        {night.harassed && <p className="danger">討債電話打來了，精神 -{CONFIG.HARASS_SANITY_COST}。</p>}
        {night.thug && <p className="danger">阿龍派人到門口了。明天不能打工，精神再 -{CONFIG.THUG_SANITY_COST}。</p>}
        {night.lendInterest > 0 && <p className="ok">放出去的錢滾了 ${formatMoney(night.lendInterest)} 利息。</p>}
        {night.lendDefaulted > 0 && <p className="danger">有人跑路了，${formatMoney(night.lendDefaulted)} 收不回來。</p>}
        {night.propertyMarginCall && <p className="danger big">預售屋斷頭，頭期款沒了。</p>}
        {!night.propertyMarginCall && night.propertyChange !== 0 && (
          <p className={night.propertyChange > 0 ? 'ok' : 'danger'}>
            預售屋權益 {night.propertyChange > 0 ? '+' : ''}
            {formatMoney(night.propertyChange)}。
          </p>
        )}
        {night.managedSettled !== null && night.outcome !== 'DEATH' && (
          <p className="warn">
            代操到期，賺了 ${formatMoney(night.managedSettled.profit)}，還了金主 ${formatMoney(night.managedSettled.paid)}。
          </p>
        )}
        {night.deadlineDaysLeft !== null && night.outcome !== 'DEATH' && (
          <p className="danger big">阿龍：「再給你 {night.deadlineDaysLeft} 天。」</p>
        )}
        {night.outcome === 'DEATH' && night.deathCause !== null && (
          <p className="danger big">{DEATH_CAUSE_LABEL[night.deathCause]}。</p>
        )}
        {night.outcome === 'RETIRE_OFFER' && <p className="ok big">你可以上岸了。</p>}
        {night.outcome === 'SOBER_OFFER' && <p className="ok big">已經 {CONFIG.SOBER_DAYS} 天沒進場子了。你可以就此收手。</p>}
      </section>

      <section className="card news-card">
        <span className="muted small">睡前滑到的</span>
        <p className="news-line">{night.news}</p>
      </section>

      <div className="spacer" />

      {night.outcome === 'RETIRE_OFFER' ? (
        <div className="action-grid">
          <button className="btn btn-big" onClick={() => dispatch({ type: 'RETIRE' })}>
            上岸
          </button>
          <button className="btn btn-big" onClick={() => dispatch({ type: 'NEXT_DAY' })}>
            繼續玩
          </button>
        </div>
      ) : night.outcome === 'SOBER_OFFER' ? (
        <div className="action-grid">
          <button className="btn btn-big" onClick={() => dispatch({ type: 'SOBER' })}>
            就此收手
          </button>
          <button className="btn btn-big" onClick={() => dispatch({ type: 'NEXT_DAY' })}>
            再玩一天
          </button>
        </div>
      ) : (
        <button className="btn btn-primary" onClick={() => dispatch({ type: 'NEXT_DAY' })}>
          {night.outcome === 'DEATH' ? '看結果' : '下一天'}
        </button>
      )}
    </main>
  );
}
