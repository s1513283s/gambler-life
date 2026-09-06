/**
 * 分享碼：把一局的成績編成短字串，朋友貼進來就進他的排行榜。純前端，沒有後端。
 */
import type { BackgroundId, RunMode } from '../types';
import type { LeaderboardEntry } from './runlog';

const PREFIX = 'GL1.';

export interface SharePayload {
  days: number;
  peak: number;
  cause: string;
  background: BackgroundId;
  mode: RunMode;
  dailyKey: string | null;
  retired: boolean;
}

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function checksum(s: string): number {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 997;
}

export function encodeShare(p: SharePayload): string {
  const body = JSON.stringify([p.days, p.peak, p.cause, p.background, p.mode, p.dailyKey, p.retired ? 1 : 0]);
  return `${PREFIX}${toBase64Url(body)}.${checksum(body)}`;
}

export function decodeShare(code: string): SharePayload {
  const trimmed = code.trim();
  if (!trimmed.startsWith(PREFIX)) throw new Error('不是分享碼');
  const rest = trimmed.slice(PREFIX.length);
  const dot = rest.lastIndexOf('.');
  if (dot < 0) throw new Error('分享碼不完整');
  const body = fromBase64Url(rest.slice(0, dot));
  if (checksum(body) !== Number(rest.slice(dot + 1))) throw new Error('分享碼被改過');
  const arr = JSON.parse(body) as unknown[];
  if (!Array.isArray(arr) || arr.length < 7) throw new Error('分享碼格式錯誤');
  const [days, peak, cause, background, mode, dailyKey, retired] = arr;
  if (typeof days !== 'number' || typeof peak !== 'number' || typeof cause !== 'string') throw new Error('分享碼格式錯誤');
  return {
    days,
    peak,
    cause,
    background: background as BackgroundId,
    mode: mode === 'daily' ? 'daily' : 'free',
    dailyKey: typeof dailyKey === 'string' ? dailyKey : null,
    retired: retired === 1,
  };
}

export function shareToEntry(p: SharePayload, code: string): LeaderboardEntry {
  return {
    runId: `share-${checksum(code)}-${p.days}-${p.peak}`,
    mode: p.mode,
    dailyKey: p.dailyKey,
    background: p.background,
    days: p.days,
    peakNetWorth: p.peak,
    finalNetWorth: 0,
    cause: p.cause,
    retired: p.retired,
    endedAt: new Date().toISOString(),
    shared: true,
  };
}
