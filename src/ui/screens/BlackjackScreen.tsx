import { useEffect, useState } from 'react';
import { CONFIG } from '../../config';
import { formatMoney } from '../../engine/death';
import { forcedHandsLeft } from '../../engine/venueReducer';
import { useGame } from '../../store';
import type { BjHand, BlackjackMove, BlackjackSession } from '../../types';
import { canBetAt, clampStake, minBetFor } from '../../venues/betting';
import { canSplitCards, countShoe, handValue } from '../../venues/blackjack';
import { PlayingCards } from '../components/PlayingCards';
import { StakeControl } from '../components/StakeControl';
import { VenueFooter } from '../components/VenueFooter';

const MOVE_LABEL: Record<BlackjackMove, string> = { hit: '要牌', stand: '停牌', double: '加倍', split: '分牌' };
const MOVES: readonly BlackjackMove[] = ['hit', 'stand', 'double', 'split'];

interface Props {
  session: BlackjackSession;
}

export function BlackjackScreen({ session }: Props) {
  const state = useGame((s) => s.state);
  const dispatch = useGame((s) => s.dispatch);

  const minBet = minBetFor('blackjack', state.cash, state.tilt);
  const [wantedStake, setStake] = useState(minBet);
  const stake = clampStake(wantedStake, minBet, state.cash);

  const round = session.round;
  const stage = round?.stage ?? null;
  const playing = stage === 'PLAYER';
  const revealing = stage === 'DEALER';
  const betting = round === null || stage === 'DONE';

  // 莊家翻牌動畫：DEALER 階段等 REVEAL_MS 再派彩。重整後仍在 DEALER，會重播一次再派彩。
  useEffect(() => {
    if (!revealing) return;
    const timer = setTimeout(() => dispatch({ type: 'BLACKJACK_RESOLVE' }), CONFIG.BLACKJACK_REVEAL_MS);
    return () => clearTimeout(timer);
  }, [revealing, round, dispatch]);

  const active = playing && round !== null ? round.hands[round.active] : null;
  const canDouble = active !== null && active.cards.length === 2 && state.cash >= active.stake;
  const canSplit =
    active !== null && round !== null && round.hands.length === 1 && canSplitCards(active.cards) && state.cash >= active.stake;
  const moveEnabled: Record<BlackjackMove, boolean> = { hit: playing, stand: playing, double: canDouble, split: canSplit };

  const dealerCards = round?.dealer ?? [];
  const dealerTotal = round !== null && !playing ? handValue(round.dealer).total : null;
  const accuracy =
    state.stats.bjDecisions > 0
      ? `策略正確率 ${Math.round(((state.stats.bjDecisions - state.stats.bjMistakes) / state.stats.bjDecisions) * 100)}%`
      : undefined;
  const affordable = canBetAt('blackjack', state.cash);
  const count = state.stats.bjDecisions >= CONFIG.CARD_COUNT_UNLOCK_DECISIONS ? countShoe(session.shoe, session.cursor) : null;

  return (
    <main className="screen">
      <section className="table">
        <div className="hand-row">
          <span className="hand-label">莊</span>
          <PlayingCards cards={dealerCards} revealing={revealing} hiddenIndex={playing ? 1 : -1} />
          <span className={`hand-total ${revealing ? 'hidden-until-reveal' : ''}`}>{dealerTotal ?? ''}</span>
        </div>
        {(round?.hands ?? []).map((h, i) => (
          <HandLine key={i} hand={h} active={playing && round?.active === i} payout={stage === 'DONE' ? round?.payouts[i] : undefined} />
        ))}
        <ResultLine round={round} />
        {count !== null && (
          <div className={`count-line ${count.trueCount >= 2 ? 'ok' : count.trueCount <= -2 ? 'danger' : 'muted'}`}>
            流水數 {count.running > 0 ? '+' : ''}{count.running} · 真數 {count.trueCount.toFixed(1)} · 剩 {count.decksLeft.toFixed(1)} 副
            {count.trueCount >= 2 ? ' · 牌靴偏大，加注' : ''}
          </div>
        )}
      </section>

      {betting ? (
        <>
          <StakeControl min={minBet} cash={state.cash} value={stake} tilt={state.tilt} disabled={!affordable} onChange={setStake} />
          <button className="btn btn-primary" disabled={!affordable} onClick={() => dispatch({ type: 'BLACKJACK_DEAL', stake })}>
            {affordable ? `發牌 $${formatMoney(stake)}` : '現金不足'}
          </button>
        </>
      ) : (
        <div className="move-grid">
          {MOVES.map((m) => (
            <button key={m} className="btn btn-big" disabled={!moveEnabled[m]} onClick={() => dispatch({ type: 'BLACKJACK_MOVE', move: m })}>
              <span className="btn-title">{MOVE_LABEL[m]}</span>
            </button>
          ))}
        </div>
      )}

      <VenueFooter
        handsPlayed={session.handsPlayed}
        net={session.net}
        forced={forcedHandsLeft(state)}
        canLeave={betting}
        onLeave={() => dispatch({ type: 'LEAVE_VENUE' })}
        extra={accuracy}
      />
    </main>
  );
}

function HandLine({ hand, active, payout }: { hand: BjHand; active: boolean; payout: number | undefined }) {
  const value = handValue(hand.cards);
  const label = value.total > 21 ? '爆' : value.soft && value.total < 21 ? `軟${value.total}` : String(value.total);
  const net = payout === undefined ? null : payout - hand.stake;
  return (
    <div className={`hand-row ${active ? 'hand-active' : ''}`}>
      <span className="hand-label">{active ? '▶' : ''}</span>
      <PlayingCards cards={hand.cards} revealing={false} />
      <span className="hand-total">
        {label}
        {net !== null && <small className={net > 0 ? 'ok' : net < 0 ? 'danger' : 'muted'}> {net > 0 ? '+' : ''}{formatMoney(net)}</small>}
      </span>
    </div>
  );
}

function ResultLine({ round }: { round: BlackjackSession['round'] }) {
  if (round === null) return <div className="result-line muted">請下注</div>;
  if (round.stage === 'PLAYER') return <div className="result-line muted">你的決定</div>;
  if (round.stage === 'DEALER') return <div className="result-line muted">莊家翻牌…</div>;
  const staked = round.hands.reduce((s, h) => s + h.stake, 0);
  const net = round.payouts.reduce((s, p) => s + p, 0) - staked;
  const tone = net > 0 ? 'ok' : net < 0 ? 'danger' : 'muted';
  return (
    <div className={`result-line ${tone}`}>
      {net > 0 ? '贏' : net < 0 ? '輸' : '平手'} · {net > 0 ? '+' : ''}
      {formatMoney(net)}
    </div>
  );
}
