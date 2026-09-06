import { CONFIG } from '../config';
import type { GameState, VenueId } from '../types';
import { clampSanity, netWorth } from './economy';
import { applyUnlocks } from './unlocks';

export function withPeak(state: GameState): GameState {
  const worth = netWorth(state);
  if (worth <= state.stats.peakNetWorth) return state;
  return { ...state, stats: { ...state.stats, peakNetWorth: worth } };
}

/** 一局結束後共用的精神與統計更新。 */
export function applyRoundResult(state: GameState, kind: VenueId, net: number, sanityDelta: number): GameState {
  const byVenue = { ...state.stats.byVenue };
  byVenue[kind] = { ...byVenue[kind], net: byVenue[kind].net + net };
  const s = state.stats;
  const streak = net > 0 ? Math.max(1, state.venueStreak + 1) : net < 0 ? Math.min(-1, state.venueStreak - 1) : state.venueStreak;
  return applyUnlocks(
    withPeak({
      ...state,
      sanity: clampSanity(state.sanity + sanityDelta),
      venueNetToday: state.venueNetToday + net,
      venueStreak: streak,
      stats: {
        ...s,
        maxWinStreak: Math.max(s.maxWinStreak, streak),
        biggestWin: Math.max(s.biggestWin, net),
        biggestWinDay: net > s.biggestWin ? state.day : s.biggestWinDay,
        biggestLoss: Math.min(s.biggestLoss, net),
        biggestLossDay: net < s.biggestLoss ? state.day : s.biggestLossDay,
        byVenue,
      },
    }),
  );
}

export function recordWager(state: GameState, kind: VenueId, stake: number, ev: number): GameState {
  const byVenue = { ...state.stats.byVenue };
  byVenue[kind] = { ...byVenue[kind], wagered: byVenue[kind].wagered + stake };
  return {
    ...state,
    stats: {
      ...state.stats,
      totalWagered: state.stats.totalWagered + stake,
      totalEvGiven: state.stats.totalEvGiven + ev,
      byVenue,
    },
  };
}

export function winLossSanity(net: number): number {
  if (net > 0) return CONFIG.GAMBLE_WIN_SANITY;
  if (net < 0) return -CONFIG.GAMBLE_LOSS_SANITY;
  return 0;
}
