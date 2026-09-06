import { useEffect, useState } from 'react';
import { CONFIG } from '../../config';
import { formatMoney } from '../../engine/death';
import { forcedHandsLeft } from '../../engine/venueReducer';
import { useGame } from '../../store';
import type { SicboBet, SicboSession } from '../../types';
import { canBetAt, clampStake, minBetFor } from '../../venues/betting';
import { StakeControl } from '../components/StakeControl';
import { VenueFooter } from '../components/VenueFooter';

interface Props {
  session: SicboSession;
}

const DOTS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function betLabel(bet: SicboBet): string {
  switch (bet.kind) {
    case 'big':
      return '大';
    case 'small':
      return '小';
    case 'anyTriple':
      return '任意圍骰';
    case 'triple':
      return `圍骰 ${bet.face}`;
  }
}

export function SicboScreen({ session }: Props) {
  const state = useGame((s) => s.state);
  const dispatch = useGame((s) => s.dispatch);
  const minBet = minBetFor('sicbo', state.cash, state.tilt);
  const [bet, setBet] = useState<SicboBet>({ kind: 'big' });
  const [wantedStake, setStake] = useState(minBet);
  const stake = clampStake(wantedStake, minBet, state.cash);
  const pending = session.pending;
  const rolling = pending !== null;

  useEffect(() => {
    if (pending === null) return;
    const timer = setTimeout(() => dispatch({ type: 'SICBO_RESOLVE' }), CONFIG.SICBO_REVEAL_MS);
    return () => clearTimeout(timer);
  }, [pending, dispatch]);

  const shown = pending ?? session.lastResult;
  const affordable = canBetAt('sicbo', state.cash);
  const last = session.lastResult;
  const net = last === null ? 0 : last.payout - last.stake;

  return (
    <main className="screen">
      <section className="table sicbo-table">
        <div className="dice-row">
          {[0, 1, 2].map((i) => (
            <Die key={i} face={shown?.dice[i] ?? 1} rolling={rolling} delay={i * 120} />
          ))}
        </div>
        <div className="result-line-wrap">
          {rolling ? (
            <div className="result-line muted">擲骰中…</div>
          ) : last === null ? (
            <div className="result-line muted">請下注</div>
          ) : (
            <div className={`result-line ${net > 0 ? 'ok' : 'danger'}`}>
              {last.dice.join(' ')} 合計 {last.dice[0] + last.dice[1] + last.dice[2]} · {betLabel(last.bet)} {net > 0 ? '+' : ''}
              {formatMoney(net)}
            </div>
          )}
        </div>
      </section>

      <div className="side-grid two">
        <button className={`btn side-btn ${bet.kind === 'small' ? 'side-active' : ''}`} disabled={rolling} onClick={() => setBet({ kind: 'small' })}>
          <span className="btn-title">小</span>
          <span className="btn-sub">4-10 · 1:1</span>
        </button>
        <button className={`btn side-btn ${bet.kind === 'big' ? 'side-active' : ''}`} disabled={rolling} onClick={() => setBet({ kind: 'big' })}>
          <span className="btn-title">大</span>
          <span className="btn-sub">11-17 · 1:1</span>
        </button>
      </div>
      <div className="side-grid two">
        <button className={`btn side-btn ${bet.kind === 'anyTriple' ? 'side-active' : ''}`} disabled={rolling} onClick={() => setBet({ kind: 'anyTriple' })}>
          <span className="btn-title">任意圍骰</span>
          <span className="btn-sub">1:{CONFIG.SICBO_ANY_TRIPLE_PAYOUT}</span>
        </button>
        <div className="triple-picker">
          <span className="muted small">指定圍骰 1:{CONFIG.SICBO_TRIPLE_PAYOUT}</span>
          <div className="chip-row">
            {[1, 2, 3, 4, 5, 6].map((f) => (
              <button
                key={f}
                className={`chip ${bet.kind === 'triple' && bet.face === f ? 'chip-active' : ''}`}
                disabled={rolling}
                onClick={() => setBet({ kind: 'triple', face: f })}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      <StakeControl min={minBet} cash={state.cash} value={stake} tilt={state.tilt} disabled={rolling || !affordable} onChange={setStake} />

      <button className="btn btn-primary" disabled={rolling || !affordable} onClick={() => dispatch({ type: 'SICBO_BET', bet, stake })}>
        {affordable ? `押${betLabel(bet)} $${formatMoney(stake)}` : '現金不足'}
      </button>

      <VenueFooter handsPlayed={session.handsPlayed} net={session.net} forced={forcedHandsLeft(state)} canLeave={!rolling} onLeave={() => dispatch({ type: 'LEAVE_VENUE' })} />
    </main>
  );
}

function Die({ face, rolling, delay }: { face: number; rolling: boolean; delay: number }) {
  return (
    <div className={`die ${rolling ? 'die-rolling' : ''}`} style={rolling ? { animationDelay: `${delay}ms` } : undefined}>
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={`pip ${DOTS[face]?.includes(i) ? 'pip-on' : ''}`} />
      ))}
    </div>
  );
}
