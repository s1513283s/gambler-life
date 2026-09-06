import { CONFIG } from '../config';
import { VENUE_IDS, VENUE_TIER, type GameState, type VenueId } from '../types';

/** 開局就有的場子 */
export function baseUnlocks(): VenueId[] {
  return VENUE_IDS.filter((id) => VENUE_TIER[id] === 0);
}

/** 目前資格夠到第幾層 */
export function tierReached(state: GameState): 0 | 1 | 2 {
  const s = state.stats;
  const undergroundLoss = -(s.byVenue.baccarat.net + s.byVenue.blackjack.net + s.byVenue.sicbo.net + s.byVenue.niuniu.net + s.byVenue.longmen.net);
  if (s.totalBorrowed >= CONFIG.UNLOCK_TIER2_BORROWED || undergroundLoss >= CONFIG.UNLOCK_TIER2_LOST) return 2;
  if (s.totalBorrowed > 0 || state.debt > 0) return 1;
  return 0;
}

/**
 * 把新達到的層級加進 unlockedVenues，並排進 pendingUnlock 等 UI 播對話。
 * silent = true 時不排對話（開局背景本來就欠錢的情況）。
 */
export function applyUnlocks(state: GameState, silent = false): GameState {
  const tier = tierReached(state);
  const fresh = VENUE_IDS.filter((id) => VENUE_TIER[id] <= tier && !state.unlockedVenues.includes(id));
  if (fresh.length === 0) return state;
  return {
    ...state,
    unlockedVenues: [...state.unlockedVenues, ...fresh],
    pendingUnlock: silent ? state.pendingUnlock : [...(state.pendingUnlock ?? []), ...fresh],
  };
}

export function isUnlocked(state: GameState, id: VenueId): boolean {
  return state.unlockedVenues.includes(id);
}

/** 解鎖對話：阿龍講的話 */
export const UNLOCK_DIALOGUE: Record<1 | 2, { speaker: string; lines: string[] }> = {
  1: { speaker: '阿龍', lines: ['錢先拿去。', '缺錢可以來我這邊玩兩把，樓下有桌子。'] },
  2: { speaker: '阿龍', lines: ['你這種人我看多了。', '後面那間，別讓條子看到。'] },
};

export function unlockTierOf(ids: readonly VenueId[]): 1 | 2 {
  return ids.some((id) => VENUE_TIER[id] === 2) ? 2 : 1;
}
