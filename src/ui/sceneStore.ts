import { create } from 'zustand';
import { CONFIG } from '../config';

/**
 * 場景切換的遮幕狀態。closing：遮幕從透明蓋到全黑；opening：從全黑拉開。
 * 只管視覺，不碰 GameState。想帶遮幕切畫面的地方呼叫 transitionTo(fn)，fn 在全黑那一刻執行。
 */
export type Curtain = 'idle' | 'closing' | 'opening';

interface SceneStore {
  curtain: Curtain;
  /** 每次切換 +1，讓遮幕元件重播動畫 */
  serial: number;
  transitionTo: (commit: () => void) => void;
}

let timer: ReturnType<typeof setTimeout> | null = null;

export const useScene = create<SceneStore>((set, get) => ({
  curtain: 'idle',
  serial: 0,
  transitionTo: (commit) => {
    if (get().curtain !== 'idle') return; // 動畫中不接受第二次
    if (timer !== null) clearTimeout(timer);
    if (reducedMotion()) {
      commit();
      return;
    }
    set((s) => ({ curtain: 'closing', serial: s.serial + 1 }));
    timer = setTimeout(() => {
      commit();
      set((s) => ({ curtain: 'opening', serial: s.serial + 1 }));
      timer = setTimeout(() => {
        set({ curtain: 'idle' });
        timer = null;
      }, CONFIG.SCENE_CURTAIN_MS);
    }, CONFIG.SCENE_CURTAIN_MS);
  },
}));

/** 使用者要求減少動態時，所有 JS 排程的動畫時間都縮成幾乎為零 */
export function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** 依減少動態設定縮放時間 */
export function motionMs(ms: number): number {
  return reducedMotion() ? 1 : ms;
}
