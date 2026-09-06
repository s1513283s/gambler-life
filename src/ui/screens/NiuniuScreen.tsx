import { useEffect, useState } from 'react';
import { CONFIG } from '../../config';
import { formatMoney } from '../../engine/death';
import { niuniuMaxStake } from '../../engine/undergroundReducer';
import { forcedHandsLeft } from '../../engine/venueReducer';
import { useGame } from '../../store';
import type { NiuniuSession } from '../../types';
import { canBetAt, clampStake, minBetFor } from '../../venues/betting';
import { multiplierOf, niuLabel } from '../../venues/niuniu';
import { PlayingCards } from '../components/PlayingCards';
import { StakeControl } from '../components/StakeControl';
import { VenueFooter } from '../components/VenueFooter';

interface Props {
  session: NiuniuSession;
}

export function NiuniuScreen({ session }: Props) {
  const state = useGame((s) => s.state);
  const dispatch = useGame((s) => s.dispatch);
  const minBet = minBetFor('niuniu', state.cash, state.tilt);
  const maxStake = niuniuMaxStake(state.cash);
  const [wantedStake, setStake] = useState(minBet);
  const stake = Math.min(clampStake(wantedStake, minBet, state.cash), Math.max(maxStake, minBet));
  const pending = session.pending;
  const revealing = pending !== null;

  useEffect(() => {
    if (pending === null) return;
    const timer = setTimeout(() => dispatch({ type: 'NIUNIU_RESOLVE' }), CONFIG.NIUNIU_REVEAL_MS);
    return () => clearTimeout(timer);
  }, [pending, dispatch]);

  const shown = pending ?? session.lastResult;
  const last = session.lastResult;
  const affordable = canBetAt('niuniu', state.cash) && maxStake >= minBet;
  const net = last === null ? 0 : last.playerWins ? last.stake * last.multiplier : -last.stake * last.multiplier;

  return (
    <main className="screen">
      <section className="table">
        <div className="hand-row niu-row">
          <span className="hand-label">莊</span>
          <PlayingCards cards={shown?.banker.cards ?? []} revealing={revealing} delayMs={0} />
          <span className={`hand-total niu-total ${revealing ? 'hidden-until-reveal' : ''}`}>{shown ? niuLabel(shown.banker.niu) : ''}</span>
        </div>
        <div className="hand-row niu-row">
          <span className="hand-label">閒</span>
          <PlayingCards cards={shown?.player.cards ?? []} revealing={revealing} delayMs={200} />
          <span className={`hand-total niu-total ${revealing ? 'hidden-until-reveal' : ''}`}>{shown ? niuLabel(shown.player.niu) : ''}</span>
        </div>
        {revealing ? (
          <div className="result-line muted">發牌中…</div>
        ) : last === null ? (
          <div className="result-line muted">請下注</div>
        ) : (
          <div className={`result-line ${net > 0 ? 'ok' : 'danger'}`}>
            {last.playerWins ? '閒贏' : '莊贏'} × {last.multiplier} · {net > 0 ? '+' : ''}
            {formatMoney(net)}
          </div>
        )}
      </section>

      <section className="card">
        <p className="muted small">
          牛牛賠 {multiplierOf(10)} 倍、牛七到牛九 {multiplierOf(7)} 倍、其餘 1 倍。輸的時候也照對方倍數賠，所以注碼最多是現金的三分之一。平手歸莊。
        </p>
      </section>

      <StakeControl min={minBet} cash={Math.max(maxStake, minBet)} value={stake} tilt={state.tilt} disabled={revealing || !affordable} onChange={setStake} />

      <button className="btn btn-primary" disabled={revealing || !affordable} onClick={() => dispatch({ type: 'NIUNIU_BET', stake })}>
        {affordable ? `下注 $${formatMoney(stake)}` : '現金不足'}
      </button>

      <VenueFooter handsPlayed={session.handsPlayed} net={session.net} forced={forcedHandsLeft(state)} canLeave={!revealing} onLeave={() => dispatch({ type: 'LEAVE_VENUE' })} />
    </main>
  );
}
