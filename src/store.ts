import { create } from 'zustand';
import { browserStore, recordRun } from './analytics/runlog';
import { assertInvariants } from './engine/invariants';
import { loadSave, saveGame } from './engine/persist';
import { createTitleState, reduce } from './engine/reducer';
import type { GameAction, GameState } from './types';

interface GameStore {
  state: GameState;
  dispatch: (action: GameAction) => void;
}

export const useGame = create<GameStore>((set, get) => ({
  state: loadSave() ?? createTitleState(),
  dispatch: (action) => {
    const prev = get().state;
    const next = reduce(prev, action);
    if (next === prev) return;
    if (import.meta.env.DEV) assertInvariants(next);
    set({ state: next });
  },
}));

const FINISHED: readonly string[] = ['DEATH', 'RETIRED'];

// 每次狀態變動立即寫入；一局結束時順便寫排行榜與 run 紀錄。
useGame.subscribe((store, prevStore) => {
  const next = store.state;
  const prev = prevStore.state;
  if (next === prev) return;
  saveGame(next);
  if (FINISHED.includes(next.phase) && !FINISHED.includes(prev.phase) && next.runId === prev.runId) {
    recordRun(browserStore(), next);
  }
});

/** 亂數 seed 與 runId 在 reducer 外產生，reducer 保持純函數。 */
export function newRunAction(): GameAction {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  const seed = buf[0];
  return { type: 'NEW_RUN', seed, runId: `${Date.now().toString(36)}-${seed.toString(36)}` };
}
