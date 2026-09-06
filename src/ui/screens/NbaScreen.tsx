import { useEffect, useState } from 'react';
import { CONFIG } from '../../config';
import { loadNbaDays } from '../../data/loaders';
import type { NbaGame } from '../../data/schema';
import { formatMoney } from '../../engine/death';
import { useGame } from '../../store';
import type { NbaBet, NbaLegPick, NbaMarket, NbaSide } from '../../types';
import { clampStake } from '../../venues/betting';
import { combinedOdds, legLabel, resolveLeg } from '../../venues/nba';
import { StakeControl } from '../components/StakeControl';

interface Props {
  onClose: () => void;
}

type Mode = 'single' | 'parlay';

const MARKET_LABEL: Record<NbaMarket, string> = { ml: '獨贏', spread: '讓分', total: '大小' };


export function NbaScreen({ onClose }: Props) {
  const state = useGame((s) => s.state);
  const dispatch = useGame((s) => s.dispatch);
  const [loadError, setLoadError] = useState(false);
  const [mode, setMode] = useState<Mode>('single');
  const [picks, setPicks] = useState<NbaLegPick[]>([]);
  const [wantedStake, setStake] = useState<number>(CONFIG.NBA_MIN_BET);

  const loaded = state.nbaToday !== null && state.nbaTodayDay === state.day;
  useEffect(() => {
    if (loaded) return;
    loadNbaDays().then(
      (pool) => dispatch({ type: 'NBA_LOAD_DAY', pool }),
      () => setLoadError(true),
    );
  }, [loaded, dispatch]);

  const games = loaded ? (state.nbaToday ?? []) : [];
  const stake = clampStake(wantedStake, CONFIG.NBA_MIN_BET, state.cash);
  const legs = picks.map((p) => resolveLeg(games, p)).filter((l) => l !== null);
  const odds = combinedOdds(legs);
  const parlayFull = state.parlaysToday >= CONFIG.PARLAY_MAX_PER_DAY;
  const canBet =
    state.cash >= CONFIG.NBA_MIN_BET &&
    legs.length === picks.length &&
    (mode === 'single' ? legs.length === 1 : legs.length >= CONFIG.PARLAY_MIN_LEGS && !parlayFull);

  const isPicked = (gameId: string, market: NbaMarket, side: NbaSide) =>
    picks.some((p) => p.gameId === gameId && p.market === market && p.side === side);

  const toggle = (gameId: string, market: NbaMarket, side: NbaSide) => {
    if (isPicked(gameId, market, side)) {
      setPicks(picks.filter((p) => !(p.gameId === gameId && p.market === market && p.side === side)));
      return;
    }
    const others = mode === 'single' ? [] : picks.filter((p) => p.gameId !== gameId);
    if (mode === 'parlay' && others.length >= CONFIG.PARLAY_MAX_LEGS) return;
    setPicks([...others, { gameId, market, side }]);
  };

  const placeBet = () => {
    dispatch({ type: 'NBA_BET', legs: picks, stake });
    setPicks([]);
  };

  return (
    <main className="screen">
      <section className="card">
        <div className="statusbar-row">
          <h2>今日 NBA</h2>
          <div className="mode-toggle">
            <button className={`chip ${mode === 'single' ? 'chip-active' : ''}`} onClick={() => { setMode('single'); setPicks([]); }}>
              單注
            </button>
            <button className={`chip ${mode === 'parlay' ? 'chip-active' : ''}`} onClick={() => { setMode('parlay'); setPicks([]); }}>
              串關
            </button>
          </div>
        </div>
        {loadError && <p className="danger">賽程載入失敗。</p>}
        {!loaded && !loadError && <p className="muted">載入賽程…</p>}
        {loaded && games.length === 0 && <p className="muted">今日無賽事。</p>}
        {mode === 'parlay' && (
          <p className="muted small">
            選 {CONFIG.PARLAY_MIN_LEGS} 到 {CONFIG.PARLAY_MAX_LEGS} 場，每場一個盤口，全中才賠。今天還能下 {CONFIG.PARLAY_MAX_PER_DAY - state.parlaysToday} 張。
          </p>
        )}
      </section>

      {games.map((g) => (
        <GameCard key={g.id} game={g} insider={state.insiderGameId === g.id} isPicked={isPicked} onPick={toggle} />
      ))}

      {picks.length > 0 && (
        <section className="card slip">
          <div className="kv">
            <span className="muted">{mode === 'parlay' ? `${legs.length} 串 1` : '單注'}</span>
            <span>賠率 {odds.toFixed(2)}</span>
          </div>
          <div className="kv">
            <span className="muted">可贏</span>
            <span className={`gold ${mode === 'parlay' ? 'big' : ''}`}>${formatMoney(Math.floor(stake * odds) - stake)}</span>
          </div>
          <StakeControl min={CONFIG.NBA_MIN_BET} cash={state.cash} value={stake} tilt={false} disabled={state.cash < CONFIG.NBA_MIN_BET} onChange={setStake} />
          <button className="btn btn-primary" disabled={!canBet} onClick={placeBet}>
            {parlayFull && mode === 'parlay' ? '今天串關額度用完' : `下注 $${formatMoney(stake)}，精神 -${CONFIG.NBA_BET_SANITY_COST}`}
          </button>
        </section>
      )}

      {state.nbaBets.length > 0 && (
        <section className="card">
          <h2>今天已下 {state.nbaBets.length} 張</h2>
          {state.nbaBets.map((b) => (
            <BetLine key={b.id} bet={b} />
          ))}
        </section>
      )}

      <div className="spacer" />
      <button className="btn" onClick={onClose}>
        離開
      </button>
    </main>
  );
}

function GameCard({
  game,
  insider,
  isPicked,
  onPick,
}: {
  game: NbaGame;
  insider: boolean;
  isPicked: (gameId: string, market: NbaMarket, side: NbaSide) => boolean;
  onPick: (gameId: string, market: NbaMarket, side: NbaSide) => void;
}) {
  const cell = (market: NbaMarket, side: NbaSide, label: string, odds: number) => (
    <button className={`odds-btn ${isPicked(game.id, market, side) ? 'odds-active' : ''}`} onClick={() => onPick(game.id, market, side)}>
      <span className="odds-label">{label}</span>
      <span className="odds-value">{odds.toFixed(2)}</span>
    </button>
  );
  const line = game.spread.line;
  return (
    <section className={`card game-card ${insider ? 'game-insider' : ''}`}>
      <div className="game-head">
        <span>
          {game.away} <span className="muted">@</span> {game.home}
        </span>
        {insider && <span className="insider-tag">內線</span>}
      </div>
      <div className="odds-grid">
        <span className="muted small">{MARKET_LABEL.ml}</span>
        {cell('ml', 'away', game.away, game.ml.away)}
        {cell('ml', 'home', game.home, game.ml.home)}
        <span className="muted small">{MARKET_LABEL.spread}</span>
        {cell('spread', 'away', `${game.away} ${-line > 0 ? '+' : ''}${-line}`, game.spread.away)}
        {cell('spread', 'home', `${game.home} ${line > 0 ? '+' : ''}${line}`, game.spread.home)}
        <span className="muted small">{MARKET_LABEL.total}</span>
        {cell('total', 'over', `大 ${game.total.line}`, game.total.over)}
        {cell('total', 'under', `小 ${game.total.line}`, game.total.under)}
      </div>
    </section>
  );
}

function BetLine({ bet }: { bet: NbaBet }) {
  return (
    <div className="bet-line">
      <span className="muted small">{bet.legs.map(legLabel).join(' + ')}</span>
      <span className="small">
        ${formatMoney(bet.stake)} @ {combinedOdds(bet.legs).toFixed(2)}
      </span>
    </div>
  );
}
