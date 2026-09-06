import { CONFIG } from '../config';
import type { NbaGame } from '../data/schema';
import { rngStep } from '../engine/rng';
import type { NbaBet, NbaBetLeg, NbaLegOutcome, NbaLegPick } from '../types';

/** 從賽程把玩家選的腿補上賠率、盤口與隊名。找不到或選項不合法回傳 null。 */
export function resolveLeg(games: readonly NbaGame[], pick: NbaLegPick): NbaBetLeg | null {
  const game = games.find((g) => g.id === pick.gameId);
  if (game === undefined) return null;
  const base = { ...pick, home: game.home, away: game.away };
  switch (pick.market) {
    case 'ml':
      if (pick.side === 'home') return { ...base, odds: game.ml.home, line: 0 };
      if (pick.side === 'away') return { ...base, odds: game.ml.away, line: 0 };
      return null;
    case 'spread':
      if (pick.side === 'home') return { ...base, odds: game.spread.home, line: game.spread.line };
      if (pick.side === 'away') return { ...base, odds: game.spread.away, line: game.spread.line };
      return null;
    case 'total':
      if (pick.side === 'over') return { ...base, odds: game.total.over, line: game.total.line };
      if (pick.side === 'under') return { ...base, odds: game.total.under, line: game.total.line };
      return null;
  }
}

/** 一腿的結果。讓分：主隊得分 + line 與客隊比；大小分：總分與 line 比。 */
export function settleLeg(leg: NbaBetLeg, score: { home: number; away: number }): NbaLegOutcome {
  const decide = (diff: number): NbaLegOutcome => (diff > 0 ? 'win' : diff < 0 ? 'loss' : 'push');
  switch (leg.market) {
    case 'ml': {
      const margin = score.home - score.away;
      return decide(leg.side === 'home' ? margin : -margin);
    }
    case 'spread': {
      const covered = score.home + leg.line - score.away;
      return decide(leg.side === 'home' ? covered : -covered);
    }
    case 'total': {
      const diff = score.home + score.away - leg.line;
      return decide(leg.side === 'over' ? diff : -diff);
    }
  }
}

/** 串關賠率：push 的腿以 1.0 計 */
export function combinedOdds(legs: readonly NbaBetLeg[], outcomes?: readonly NbaLegOutcome[]): number {
  return legs.reduce((acc, leg, i) => (outcomes?.[i] === 'push' ? acc : acc * leg.odds), 1);
}

/** 退還總額。任一腿輸 = 0；全 push = 退本金。 */
export function payoutFor(bet: NbaBet, outcomes: readonly NbaLegOutcome[]): number {
  if (outcomes.some((o) => o === 'loss')) return 0;
  return Math.floor(bet.stake * combinedOdds(bet.legs, outcomes));
}

/** EV 記帳：單注 stake x vig；串關 stake x (1 - (1 - vig)^legs) */
export function nbaEdgeCost(stake: number, legs: number): number {
  if (legs <= 1) return stake * CONFIG.NBA_VIG;
  return stake * (1 - Math.pow(1 - CONFIG.NBA_VIG, legs));
}

export interface DayOrderBuild {
  order: number[];
  rngState: number;
}

/**
 * 打亂比賽日並插入無賽事日（-1）。每局隨機起點，玩家第二局不會再看到同一個第一天。
 */
export function buildDayOrder(dayCount: number, rngState: number): DayOrderBuild {
  let state = rngState;
  const next = (): number => {
    const step = rngStep(state);
    state = step.state;
    return step.value;
  };
  const order = Array.from({ length: dayCount }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const withRest: number[] = [];
  for (const d of order) {
    if (next() < CONFIG.NBA_NO_GAME_DAY_RATE) withRest.push(-1);
    withRest.push(d);
  }
  return { order: withRest, rngState: state };
}

export function validateLegs(legs: readonly NbaLegPick[]): boolean {
  if (legs.length < 1 || legs.length > CONFIG.PARLAY_MAX_LEGS) return false;
  const games = new Set(legs.map((l) => l.gameId));
  return games.size === legs.length; // 串關每腿必須不同場
}

/** 注單上的一腿文字，例如「湖人 -2.5」「大 228.5」 */
export function legLabel(leg: Pick<NbaBetLeg, 'market' | 'side' | 'line' | 'home' | 'away'>): string {
  const team = leg.side === 'home' ? leg.home : leg.side === 'away' ? leg.away : '';
  switch (leg.market) {
    case 'ml':
      return `${team} 獨贏`;
    case 'spread': {
      const line = leg.side === 'home' ? leg.line : -leg.line;
      return `${team} ${line > 0 ? '+' : ''}${line}`;
    }
    case 'total':
      return `${leg.side === 'over' ? '大' : '小'} ${leg.line}`;
  }
}
