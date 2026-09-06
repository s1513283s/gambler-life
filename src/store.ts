import { create } from 'zustand';
import { recordAchievements, type AchievementDef } from './analytics/achievements';
import { markRetired } from './analytics/meta';
import { browserStore, recordRun } from './analytics/runlog';
import { CONFIG } from './config';
import { assertInvariants } from './engine/invariants';
import { loadSave, saveGame } from './engine/persist';
import { createTitleState, reduce } from './engine/reducer';
import type { BackgroundId, GameAction, GameState, RunMode } from './types';

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
let freshAchievements: AchievementDef[] = [];

/** 最近一局結束時新拿到的成就，死亡畫面顯示用 */
export function lastNewAchievements(): AchievementDef[] {
  return freshAchievements;
}

// 每次狀態變動立即寫入；一局結束時順便寫排行榜與 run 紀錄。
useGame.subscribe((store, prevStore) => {
  const next = store.state;
  const prev = prevStore.state;
  if (next === prev) return;
  saveGame(next);
  if (FINISHED.includes(next.phase) && !FINISHED.includes(prev.phase) && next.runId === prev.runId) {
    recordRun(browserStore(), next);
    if (next.phase === 'RETIRED') markRetired(browserStore());
    freshAchievements = recordAchievements(browserStore(), next);
  }
});

/** 本地日期 YYYY-MM-DD，每日挑戰的 key */
export function todayKey(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** FNV-1a：字串轉 32 位元 seed，全世界同一天同一顆 */
export function seedFromKey(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 每日挑戰的背景也由日期決定 */
export function dailyBackground(key: string): BackgroundId {
  const list = CONFIG.BACKGROUNDS;
  return list[seedFromKey(`${key}:bg`) % list.length].id;
}

/** 亂數 seed 與 runId 在 reducer 外產生，reducer 保持純函數。 */
export function newRunAction(mode: RunMode, background: BackgroundId): GameAction {
  if (mode === 'daily') {
    const key = todayKey();
    const seed = seedFromKey(key);
    return { type: 'NEW_RUN', seed, runId: `daily-${key}-${Date.now().toString(36)}`, mode, dailyKey: key, background: dailyBackground(key) };
  }
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  const seed = buf[0];
  return { type: 'NEW_RUN', seed, runId: `${Date.now().toString(36)}-${seed.toString(36)}`, mode, dailyKey: null, background };
}
