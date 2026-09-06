import { CONFIG } from '../config';
import type { GameState } from '../types';

/** GitHub Pages 同帳號所有 repo 共用 origin，key 一定要加前綴。 */
const SAVE_KEY = 'gambler-life:save';

export function loadSave(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Partial<GameState>;
    if (parsed.saveVersion !== CONFIG.SAVE_VERSION) {
      localStorage.removeItem(SAVE_KEY);
      return null;
    }
    return parsed as GameState;
  } catch {
    return null;
  }
}

export function saveGame(state: GameState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    // 私密瀏覽或容量滿：本局照玩，只是不會存檔
  }
}
