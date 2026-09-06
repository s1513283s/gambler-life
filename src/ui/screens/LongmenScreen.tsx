import { useEffect, useState } from 'react';
import { CONFIG } from '../../config';
import { formatMoney } from '../../engine/death';
import { longmenMaxStake } from '../../engine/undergroundReducer';
import { forcedHandsLeft } from '../../engine/venueReducer';
import { useGame } from '../../store';
import type { LongmenSession } from '../../types';
import { canBetAt, clampStake, minBetFor } from '../../venues/betting';
import { hitChance } from '../../venues/longmen';
import { PlayingCards } from '../components/PlayingCards';
import { StakeControl } from '../components/StakeControl';
import { VenueFooter } from '../components/VenueFooter';

interface Props {
  session: LongmenSession;
}

const OUTCOME_LABEL = { hit: '中門！', post: '撞柱，賠雙倍', miss: '沒中' } as const;

export function LongmenScreen({ session }: Props) {
  const state = useGame((s) => s.state);
  const dispatch = useGame((s) => s.dispatch);
  const minBet = minBetFor('longmen', state.cash, state.tilt);
  const maxStake = longmenMaxStake(state.cash);
  const [wantedStake, setStake] = useState(minBet);
  const stake = Math.min(clampStake(wantedStake, minBet, state.cash), Math.max(maxStake, minBet));
  const round = session.round;

  // 進場或上一局結束後自動發門柱
  useEffect(() => {
    if (round === null) dispatch({ type: 'LONGMEN_DEAL' });
  }, [round, dispatch]);

  // 第三張開出後停一下再派彩
  const revealing = round !== null && round.third !== null;
  useEffect(() => {
    if (!revealing) return;
    const timer = setTimeout(() => dispatch({ type: 'LONGMEN_RESOLVE' }), CONFIG.LONGMEN_REVEAL_MS);
    return () => clearTimeout(timer);
  }, [revealing, round, dispatch]);

  const affordable = canBetAt('longmen', state.cash) && maxStake >= minBet;
  const canBet = round !== null && round.stake === null && affordable;
  const chance = round !== null ? hitChance(round.posts) : 0;

  return (
    <main className="screen">
      <section className="table longmen-table">
        <div className="longmen-posts">
          <PlayingCards cards={round !== null ? [round.posts[0]] : []} revealing={false} />
          <div className="longmen-gate">
            {round !== null && round.third !== null ? (
              <PlayingCards cards={[round.third]} revealing={true} />
            ) : (
              <span className="longmen-slot">?</span>
            )}
          </div>
          <PlayingCards cards={round !== null ? [round.posts[1]] : []} revealing={false} />
        </div>
        {round !== null && round.third === null && (
          <div className="result-line muted small">中門機率約 {Math.round(chance * 100)}%</div>
        )}
        {round !== null && round.outcome !== null && (
          <div className={`result-line ${round.outcome === 'hit' ? 'ok' : 'danger'}`}>
            {OUTCOME_LABEL[round.outcome]} · {round.outcome === 'hit' ? '+' : '-'}
            {formatMoney(round.outcome === 'hit' ? round.stake ?? 0 : round.outcome === 'post' ? (round.stake ?? 0) * CONFIG.LONGMEN_POST_MULTIPLIER : (round.stake ?? 0))}
          </div>
        )}
      </section>

      <section className="card">
        <p className="muted small">第三張落在兩根門柱之間就贏 1:1，剛好等於門柱是撞柱，賠 {CONFIG.LONGMEN_POST_MULTIPLIER} 倍，所以注碼最多是現金的一半。</p>
      </section>

      <StakeControl min={minBet} cash={Math.max(maxStake, minBet)} value={stake} tilt={state.tilt} disabled={!canBet} onChange={setStake} />

      <button className="btn btn-primary" disabled={!canBet} onClick={() => dispatch({ type: 'LONGMEN_BET', stake })}>
        {affordable ? `射 $${formatMoney(stake)}` : '現金不足'}
      </button>

      <VenueFooter
        handsPlayed={session.handsPlayed}
        net={session.net}
        forced={forcedHandsLeft(state)}
        canLeave={round === null || round.stake === null}
        onLeave={() => dispatch({ type: 'LEAVE_VENUE' })}
      />
    </main>
  );
}
