/**
 * mulberry32：32 位元狀態的可序列化亂數。
 * engine 之後會把 state 存在 GameState.rngState 裡，每次取值回傳新 state，reducer 保持純函數。
 */
export interface RngStep {
  value: number; // [0, 1)
  state: number;
}

export function rngStep(state: number): RngStep {
  let t = (state + 0x6d2b79f5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), 1 | t);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  const value = ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  return { value, state: t };
}

export interface Rng {
  next(): number; // [0, 1)
  int(maxExclusive: number): number; // [0, max)
  chance(p: number): boolean;
  state(): number;
}

/** 有狀態的包裝，給模擬器與 UI 裝飾用。engine 內請直接用 rngStep。 */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return {
    next() {
      const step = rngStep(state);
      state = step.state;
      return step.value;
    },
    int(maxExclusive) {
      return Math.floor(this.next() * maxExclusive);
    },
    chance(p) {
      return this.next() < p;
    },
    state() {
      return state;
    },
  };
}
