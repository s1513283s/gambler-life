import { useEffect, useState } from 'react';
import { CONFIG } from '../../config';
import { formatMoney } from '../../engine/death';
import { forcedHandsLeft } from '../../engine/venueReducer';
import { useGame } from '../../store';
import type { BaccaratResult, BaccaratSession, BaccaratSide } from '../../types';
import { canBetAt, clampStake, minBetFor } from '../../venues/betting';
import { PlayingCards } from '../components/PlayingCards';
import { StakeControl } from '../components/StakeControl';
import { VenueFooter } from '../components/VenueFooter';

const SIDE_LABEL: Record<BaccaratSide, string> = { banker: '莊', player: '閒', tie: '和' };
const SIDE_ODDS: Record<BaccaratSide, string> = { banker: '1:0.95', player: '1:1', tie: '1:8' };
const SIDES: readonly BaccaratSide[] = ['player', 'tie', 'banker'];

interface Props {
  session: BaccaratSession;
}

export function BaccaratScreen({ session }: Props) {
  const state = useGame((s) => s.state);
  const dispatch = useGame((s) => s.dispatch);

  const minBet = minBetFor('baccarat', state.cash, state.tilt);
  const [side, setSide] = useState<BaccaratSide>('banker');
  // 玩家想押的數字；實際注碼在 render 時夾進合法範圍，現金變動不需要 effect
  const [wantedStake, setStake] = useState(minBet);
  const stake = clampStake(wantedStake, minBet, state.cash);
  // 結果停留：RESOLVE 之後短暫鎖住按鈕，讓玩家看清楚
  const [cooling, setCooling] = useState(false);

  const pending = session.pending;
  const revealing = pending !== null;

  // 發牌動畫：pending 出現後等 REVEAL_MS 再派彩。重整後 pending 還在，會重播一次動畫再派彩。
  useEffect(() => {
    if (pending === null) return;
    const timer = setTimeout(() => {
      dispatch({ type: 'BACCARAT_RESOLVE' });
      setCooling(true);
    }, CONFIG.BACCARAT_REVEAL_MS);
    return () => clearTimeout(timer);
  }, [pending, dispatch]);

  useEffect(() => {
    if (!cooling) return;
    const timer = setTimeout(() => setCooling(false), CONFIG.BACCARAT_RESULT_MS);
    return () => clearTimeout(timer);
  }, [cooling]);

  const shown = pending ?? session.lastResult;
  const busy = revealing || cooling;
  const affordable = canBetAt('baccarat', state.cash);

  return (
    <main className="screen">
      <section className="table">
        <div className="hand-row">
          <span className="hand-label">閒</span>
          <PlayingCards cards={shown?.hand.player ?? []} revealing={revealing} />
          <span className={`hand-total ${revealing ? 'hidden-until-reveal' : ''}`}>{shown?.hand.playerTotal ?? ''}</span>
        </div>
        <div className="hand-row">
          <span className="hand-label">莊</span>
          <PlayingCards cards={shown?.hand.banker ?? []} revealing={revealing} delayMs={150} />
          <span className={`hand-total ${revealing ? 'hidden-until-reveal' : ''}`}>{shown?.hand.bankerTotal ?? ''}</span>
        </div>
        <ResultLine result={revealing ? null : session.lastResult} revealing={revealing} />
      </section>

      <div className="side-grid">
        {SIDES.map((s) => (
          <button key={s} className={`btn side-btn ${side === s ? 'side-active' : ''}`} disabled={busy} onClick={() => setSide(s)}>
            <span className="btn-title">{SIDE_LABEL[s]}</span>
            <span className="btn-sub">{SIDE_ODDS[s]}</span>
          </button>
        ))}
      </div>

      <StakeControl min={minBet} cash={state.cash} value={stake} tilt={state.tilt} disabled={busy || !affordable} onChange={setStake} />

      <button className="btn btn-primary" disabled={busy || !affordable} onClick={() => dispatch({ type: 'BACCARAT_BET', side, stake })}>
        {affordable ? `押${SIDE_LABEL[side]} $${formatMoney(stake)}` : '現金不足'}
      </button>

      <VenueFooter
        handsPlayed={session.handsPlayed}
        net={session.net}
        forced={forcedHandsLeft(state)}
        canLeave={!revealing}
        onLeave={() => dispatch({ type: 'LEAVE_VENUE' })}
      />
    </main>
  );
}

function ResultLine({ result, revealing }: { result: BaccaratResult | null; revealing: boolean }) {
  if (revealing) return <div className="result-line muted">發牌中…</div>;
  if (result === null) return <div className="result-line muted">請下注</div>;
  const net = result.payout - result.stake;
  const tone = net > 0 ? 'ok' : net < 0 ? 'danger' : 'muted';
  const outcome = result.hand.outcome === 'tie' ? '和局' : `${SIDE_LABEL[result.hand.outcome]}贏`;
  return (
    <div className={`result-line ${tone}`}>
      {outcome} · {net > 0 ? '+' : ''}
      {formatMoney(net)}
    </div>
  );
}
