import { useEffect } from 'react';
import { CONFIG } from '../../config';
import { formatMoney } from '../../engine/death';
import { useGame } from '../../store';
import type { NbaBetResult, NbaLegOutcome } from '../../types';
import { legLabel } from '../../venues/nba';

const OUTCOME_ICON: Record<NbaLegOutcome, string> = { win: '✓', loss: '✗', push: '－' };

/** 逐張揭曉。每 REVEAL_MS 自動翻下一張，重整後從還沒翻的繼續。 */
export function EveningScreen() {
  const state = useGame((s) => s.state);
  const dispatch = useGame((s) => s.dispatch);
  const pending = state.nbaBets.length;

  useEffect(() => {
    if (pending === 0) return;
    const timer = setTimeout(() => dispatch({ type: 'EVENING_REVEAL' }), CONFIG.NBA_REVEAL_MS);
    return () => clearTimeout(timer);
  }, [pending, dispatch]);

  const net = state.nbaResults.reduce((sum, r) => sum + r.payout - r.bet.stake, 0);

  return (
    <main className="screen">
      <section className="card">
        <h2>晚上，賽果出來了</h2>
        <p className="muted small">{pending > 0 ? `還有 ${pending} 張…` : `今晚 ${net >= 0 ? '+' : ''}${formatMoney(net)}`}</p>
      </section>

      {state.nbaResults.map((r) => (
        <ResultCard key={r.bet.id} result={r} />
      ))}

      <div className="spacer" />
      {pending > 0 ? (
        <button className="btn" onClick={() => dispatch({ type: 'EVENING_REVEAL' })}>
          翻下一張
        </button>
      ) : (
        <button className="btn btn-primary" onClick={() => dispatch({ type: 'EVENING_DONE' })}>
          回家
        </button>
      )}
    </main>
  );
}

function ResultCard({ result }: { result: NbaBetResult }) {
  const net = result.payout - result.bet.stake;
  const tone = net > 0 ? 'ok' : net < 0 ? 'danger' : 'muted';
  const parlay = result.bet.legs.length > 1;
  return (
    <section className={`card result-card ${tone}-border`}>
      <div className="kv">
        <span className="muted small">{parlay ? `${result.bet.legs.length} 串 1` : '單注'} · ${formatMoney(result.bet.stake)}</span>
        <span className={`big ${tone}`}>
          {net > 0 ? '+' : ''}
          {formatMoney(net)}
        </span>
      </div>
      {result.bet.legs.map((leg, i) => (
        <div key={i} className="leg-line">
          <span className={`leg-icon ${result.outcomes[i]}`}>{OUTCOME_ICON[result.outcomes[i]]}</span>
          <span className="small">{legLabel(leg)}</span>
          <span className="muted small">
            {leg.away} {result.scores[i].away} : {result.scores[i].home} {leg.home}
          </span>
        </div>
      ))}
    </section>
  );
}
