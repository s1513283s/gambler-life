/**
 * 用 Web Audio 合成的音效，沒有任何音檔。第一次使用者互動時才建 AudioContext。
 */
const SOUND_KEY = 'gambler-life:sound';

export type SoundKind = 'deal' | 'win' | 'loss' | 'bigwin' | 'liquidated' | 'death' | 'coin' | 'chip' | 'card';

let ctx: AudioContext | null = null;
let enabled = readEnabled();

function readEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function isSoundEnabled(): boolean {
  return enabled;
}

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  try {
    localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
  } catch {
    // 存不了就只影響本次
  }
}

/** 綁在第一次 pointerdown 上，iOS 需要使用者手勢才能出聲 */
export function unlockAudio(): void {
  if (ctx !== null) return;
  try {
    ctx = new AudioContext();
    void ctx.resume();
  } catch {
    ctx = null;
  }
}

function tone(freq: number, startAt: number, duration: number, type: OscillatorType, gain: number): void {
  if (ctx === null) return;
  const osc = ctx.createOscillator();
  const vol = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + startAt);
  vol.gain.setValueAtTime(0, ctx.currentTime + startAt);
  vol.gain.linearRampToValueAtTime(gain, ctx.currentTime + startAt + 0.01);
  vol.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startAt + duration);
  osc.connect(vol).connect(ctx.destination);
  osc.start(ctx.currentTime + startAt);
  osc.stop(ctx.currentTime + startAt + duration + 0.05);
}

export function playSound(kind: SoundKind): void {
  if (!enabled || ctx === null) return;
  switch (kind) {
    case 'deal':
      tone(880, 0, 0.06, 'square', 0.05);
      break;
    case 'chip':
      // 籌碼敲桌：短促的兩聲喀
      tone(1500, 0, 0.03, 'square', 0.05);
      tone(900, 0.03, 0.05, 'triangle', 0.06);
      break;
    case 'card':
      // 紙牌滑出：一聲輕擦
      tone(2400, 0, 0.025, 'sawtooth', 0.025);
      break;
    case 'coin':
      tone(1320, 0, 0.08, 'triangle', 0.08);
      tone(1760, 0.06, 0.1, 'triangle', 0.06);
      break;
    case 'win':
      tone(660, 0, 0.12, 'triangle', 0.12);
      tone(880, 0.1, 0.18, 'triangle', 0.12);
      break;
    case 'bigwin':
      [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.25, 'triangle', 0.14));
      break;
    case 'loss':
      tone(330, 0, 0.14, 'sawtooth', 0.08);
      tone(262, 0.12, 0.2, 'sawtooth', 0.08);
      break;
    case 'liquidated':
      tone(110, 0, 0.5, 'sawtooth', 0.2);
      tone(82, 0.05, 0.6, 'square', 0.12);
      break;
    case 'death':
      [392, 349, 311, 262].forEach((f, i) => tone(f, i * 0.25, 0.4, 'triangle', 0.14));
      break;
  }
}
