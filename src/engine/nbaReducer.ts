import { CONFIG } from '../config';
import type { NbaGameDay } from '../data/schema';
import type { GameState, NbaBet, NbaBetLeg, NbaBetResult, NbaLegPick } from '../types';
import { buildDayOrder, nbaEdgeCost, payoutFor, resolveLeg, settleLeg, validateLegs } from '../venues/nba';
import { clampSanity } from './economy';
import { rngStep } from './rng';
import { applyRoundResult, recordWager } from './venueShared';

/** NBA_LOAD_DAY：第一次建打亂順序，之後每天把今日賽程複製進 state。已載過就略過。 */
export function nbaLoadDay(state: GameState, pool: readonly NbaGameDay[]): GameState {
  if (pool.length === 0) return state;
  if (state.nbaToday !== null && state.nbaTodayDay === state.day) return state;

  let rngState = state.rngState;
  let order = state.nbaDayOrder;
  if (order === null) {
    const built = buildDayOrder(pool.length, rngState);
    order = built.order;
    rngState = built.rngState;
  }

  const key = order[state.nbaDayIndex % order.length];
  const games = key < 0 ? [] : pool[key].games;

  let insiderGameId: string | null = null;
  if (state.insiderTipDay === state.day && games.length > 0) {
    const step = rngStep(rngState);
    rngState = step.state;
    insiderGameId = games[Math.floor(step.value * games.length)].id;
  }

  return { ...state, rngState, nbaDayOrder: order, nbaToday: games, nbaTodayDay: state.day, insiderGameId };
}

/** NBA_BET：驗證、從賽程補齊賠率、扣注金、精神 -5、記 EV。 */
export function nbaBet(state: GameState, picks: NbaLegPick[], rawStake: number): GameState {
  const games = state.nbaToday;
  if (games === null || state.nbaTodayDay !== state.day || games.length === 0) return state;
  const stake = Math.floor(rawStake);
  if (!Number.isFinite(stake) || stake < CONFIG.NBA_MIN_BET || stake > state.cash) return state;
  if (!validateLegs(picks)) return state;
  const isParlay = picks.length > 1;
  if (isParlay && (picks.length < CONFIG.PARLAY_MIN_LEGS || state.parlaysToday >= CONFIG.PARLAY_MAX_PER_DAY)) return state;

  const legs: NbaBetLeg[] = [];
  for (const pick of picks) {
    const leg = resolveLeg(games, pick);
    if (leg === null) return state;
    legs.push(leg);
  }

  const bet: NbaBet = { id: `${state.day}-${state.nbaBets.length + 1}`, stake, legs };
  const kind = isParlay ? 'parlay' : 'nba';
  const byVenue = { ...state.stats.byVenue };
  byVenue[kind] = { ...byVenue[kind], sessions: byVenue[kind].sessions + 1 };
  const wagered = recordWager(
    { ...state, stats: { ...state.stats, byVenue, parlaysPlaced: state.stats.parlaysPlaced + (isParlay ? 1 : 0) } },
    kind,
    stake,
    nbaEdgeCost(stake, legs.length),
  );
  return {
    ...wagered,
    cash: state.cash - stake,
    sanity: clampSanity(state.sanity - CONFIG.NBA_BET_SANITY_COST),
    nbaBets: [...state.nbaBets, bet],
    parlaysToday: state.parlaysToday + (isParlay ? 1 : 0),
  };
}

/** EVENING_REVEAL：結算最早的一張注單，派彩、精神、統計。 */
export function eveningReveal(state: GameState): GameState {
  const games = state.nbaToday;
  const bet = state.nbaBets[0];
  if (games === null || bet === undefined) return state;

  const scores = bet.legs.map((leg) => {
    const game = games.find((g) => g.id === leg.gameId);
    return game === undefined ? { home: 0, away: 0 } : game.score;
  });
  const outcomes = bet.legs.map((leg, i) => settleLeg(leg, scores[i]));
  const payout = payoutFor(bet, outcomes);
  const net = payout - bet.stake;
  const isParlay = bet.legs.length > 1;

  let sanityDelta = 0;
  if (net > 0) sanityDelta = isParlay ? CONFIG.PARLAY_WIN_SANITY : CONFIG.GAMBLE_WIN_SANITY;
  else if (net < 0) sanityDelta = isParlay ? -CONFIG.PARLAY_LOSS_SANITY : -CONFIG.GAMBLE_LOSS_SANITY;

  const result: NbaBetResult = { bet, outcomes, payout, scores };
  const next: GameState = {
    ...state,
    cash: state.cash + payout,
    nbaBets: state.nbaBets.slice(1),
    nbaResults: [...state.nbaResults, result],
    stats: { ...state.stats, parlaysWon: state.stats.parlaysWon + (isParlay && net > 0 ? 1 : 0) },
  };
  return applyRoundResult(next, isParlay ? 'parlay' : 'nba', net, sanityDelta);
}
