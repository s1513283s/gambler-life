import { CONFIG } from '../config';
import type { GameState, ObsessionId } from '../types';
import { rngStep } from './rng';
import { netWorth } from './economy';

export interface ObsessionDef {
  id: ObsessionId;
  text: string;
  check: (state: GameState) => boolean;
}

/** 每局開始抽一個。達成就給錢和精神，並記在死亡卡片上。 */
export const OBSESSIONS: readonly ObsessionDef[] = [
  { id: 'net200k', text: '淨值破 20 萬', check: (s) => netWorth(s) >= 200000 },
  { id: 'parlay6', text: '六串一全中一次', check: (s) => s.stats.maxParlayLegsWon >= 6 },
  { id: 'survive30', text: '活過 30 天', check: (s) => s.day >= 30 },
  { id: 'noLoan20', text: '到第 20 天一毛錢都不借', check: (s) => s.day >= 20 && s.stats.totalBorrowed === 0 && s.background !== 'broke' },
  { id: 'scratch20x', text: '刮刮樂刮中 20 倍以上', check: (s) => s.venue?.kind === 'scratch' && s.venue.lastTicket !== null && s.venue.lastTicket.prize >= s.venue.lastTicket.price * 20 },
  { id: 'bjAccuracy', text: '21 點打 50 手且正確率 90% 以上', check: (s) => s.stats.bjDecisions >= 50 && (s.stats.bjDecisions - s.stats.bjMistakes) / s.stats.bjDecisions >= 0.9 },
  { id: 'buyHouse', text: '買一間房', check: (s) => s.purchases.includes('house') },
  { id: 'streak5', text: '在一個場子連贏 5 把', check: (s) => s.stats.maxWinStreak >= 5 },
];

export function obsessionDef(id: ObsessionId): ObsessionDef {
  const def = OBSESSIONS.find((o) => o.id === id);
  if (def === undefined) throw new Error(`unknown obsession ${id}`);
  return def;
}

export function drawObsession(rngState: number, background: GameState['background']): { id: ObsessionId; rngState: number } {
  const pool = OBSESSIONS.filter((o) => !(o.id === 'noLoan20' && background === 'broke'));
  const step = rngStep(rngState);
  return { id: pool[Math.floor(step.value * pool.length)].id, rngState: step.state };
}

/** 每次狀態變動後呼叫：達成就發獎，只發一次 */
export function checkObsession(state: GameState): GameState {
  if (state.obsession.done || state.phase === 'TITLE') return state;
  if (!obsessionDef(state.obsession.id).check(state)) return state;
  return {
    ...state,
    cash: state.cash + CONFIG.OBSESSION_REWARD_CASH,
    sanity: Math.min(CONFIG.SANITY_MAX, state.sanity + CONFIG.OBSESSION_REWARD_SANITY),
    obsession: { ...state.obsession, done: true },
  };
}
