import { useEffect, useRef } from 'react';
import type { GameState } from '../types';
import { playSound, unlockAudio } from './sound';

/** 看狀態變化決定放什麼音效。reducer 不知道音效的存在。 */
export function useSoundEffects(state: GameState): void {
  const prevRef = useRef(state);

  useEffect(() => {
    const onFirstTouch = () => unlockAudio();
    window.addEventListener('pointerdown', onFirstTouch, { once: true, passive: true });
    return () => window.removeEventListener('pointerdown', onFirstTouch);
  }, []);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = state;
    if (prev === state || prev.runId !== state.runId) return;

    if (state.phase === 'DEATH' && prev.phase !== 'DEATH') {
      playSound('death');
      return;
    }
    if (state.venue?.kind === 'crypto' && state.venue.lastResult?.reason === 'liquidated' && state.venue.handsPlayed !== (prev.venue?.kind === 'crypto' ? prev.venue.handsPlayed : -1)) {
      playSound('liquidated');
      return;
    }
    const delta = state.venueNetToday - prev.venueNetToday;
    if (delta !== 0 && state.day === prev.day) {
      if (delta >= 10000) playSound('bigwin');
      else playSound(delta > 0 ? 'win' : 'loss');
      return;
    }
    const nbaDelta = state.nbaResults.length - prev.nbaResults.length;
    if (nbaDelta > 0) {
      const last = state.nbaResults[state.nbaResults.length - 1];
      playSound(last.payout > last.bet.stake ? (last.bet.legs.length > 1 ? 'bigwin' : 'win') : 'loss');
      return;
    }
    if (state.phase === 'VENUE' && prev.phase === 'VENUE' && state.cash < prev.cash) {
      playSound('deal');
      return;
    }
    if (state.cash > prev.cash && state.phase === 'ACTION' && prev.phase === 'ACTION') playSound('coin');
  }, [state]);
}
