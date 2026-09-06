import { useEffect, useState } from 'react';
import { useGame } from '../store';
import type { GameState } from '../types';

const BIG_WIN = 5000;

/** 這次狀態變化值不值得噴彩帶：單筆淨贏超過門檻、串關全中、刮刮樂中大獎、上岸。 */
function worthCelebrating(before: GameState, after: GameState): boolean {
  if (before.runId !== after.runId) return false;
  if (after.phase === 'RETIRED' && before.phase !== 'RETIRED') return true;
  if (after.venueNetToday - before.venueNetToday >= BIG_WIN && after.day === before.day) return true;
  if (after.nbaResults.length > before.nbaResults.length) {
    const last = after.nbaResults[after.nbaResults.length - 1];
    if (last.bet.legs.length > 1 && last.payout > last.bet.stake) return true;
  }
  if (after.venue?.kind === 'scratch' && after.venue.lastTicket !== null) {
    const prevHands = before.venue?.kind === 'scratch' ? before.venue.handsPlayed : -1;
    const t = after.venue.lastTicket;
    if (after.venue.handsPlayed !== prevHands && t.prize >= t.price * 5) return true;
  }
  return false;
}

/** 回傳一個每次慶祝就 +1 的計數，給 Confetti 當 key。直接訂閱 store。 */
export function useCelebrations(): number {
  const [burst, setBurst] = useState(0);
  useEffect(
    () =>
      useGame.subscribe((store, prev) => {
        if (store.state !== prev.state && worthCelebrating(prev.state, store.state)) setBurst((b) => b + 1);
      }),
    [],
  );
  return burst;
}
