/**
 * 跨局進度：目前只有「上岸過」，用來解鎖新背景。與存檔、排行榜分開存。
 */
import type { KeyValueStore } from './runlog';

export const META_KEY = 'gambler-life:meta';

export interface Meta {
  retiredOnce: boolean;
}

export function loadMeta(store: KeyValueStore): Meta {
  try {
    const raw = store.getItem(META_KEY);
    if (raw === null) return { retiredOnce: false };
    const parsed = JSON.parse(raw) as Partial<Meta>;
    return { retiredOnce: parsed.retiredOnce === true };
  } catch {
    return { retiredOnce: false };
  }
}

export function markRetired(store: KeyValueStore): void {
  try {
    store.setItem(META_KEY, JSON.stringify({ ...loadMeta(store), retiredOnce: true }));
  } catch {
    // 存不了就這局沒解鎖
  }
}
