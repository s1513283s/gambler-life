/**
 * 每局結束寫入 localStorage：排行榜（前 10）與完整 run 紀錄（最近 50 局，供調平衡）。
 * 全部 try/catch：私密瀏覽或容量滿時遊戲照玩。
 */
import { CONFIG } from '../config';
import { DEATH_CAUSE_LABEL, ENDING_LABEL } from '../engine/death';
import { netWorth } from '../engine/economy';
import type { BackgroundId, DayLog, GameState, RunMode, RunStats } from '../types';

export const LEADERBOARD_KEY = 'gambler-life:leaderboard';
export const RUNLOG_KEY = 'gambler-life:runs';

export interface LeaderboardEntry {
  runId: string;
  mode: RunMode;
  dailyKey: string | null;
  background: BackgroundId;
  days: number;
  peakNetWorth: number;
  finalNetWorth: number;
  cause: string; // 死因或「上岸」
  retired: boolean;
  endedAt: string; // ISO
  shared?: boolean; // 朋友的分享碼
}

export interface RunRecord {
  runId: string;
  seed: number;
  endedAt: string;
  days: number;
  retired: boolean;
  cause: string;
  stats: RunStats;
  history: DayLog[];
}

/** 可注入的儲存介面，測試時用記憶體物件 */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function readJson<T>(store: KeyValueStore, key: string, fallback: T): T {
  try {
    const raw = store.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function writeJson(store: KeyValueStore, key: string, value: unknown): void {
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    // 存不進去就算了
  }
}

export function causeLabel(state: GameState): string {
  if (state.ending !== null && state.ending !== 'ruined') return ENDING_LABEL[state.ending];
  if (state.phase === 'RETIRED') return ENDING_LABEL.retired;
  const cause = state.stats.causeOfDeath ? DEATH_CAUSE_LABEL[state.stats.causeOfDeath] : '';
  return state.ending === 'ruined' ? `${cause}，家破人亡` : cause;
}

/** 把朋友的分享碼加進排行榜；同一碼不重複 */
export function addSharedEntry(store: KeyValueStore, entry: LeaderboardEntry): boolean {
  const board = loadLeaderboard(store);
  if (board.some((e) => e.runId === entry.runId)) return false;
  writeJson(store, LEADERBOARD_KEY, rankEntries([...board, entry]));
  return true;
}

export function toEntry(state: GameState, endedAt = new Date().toISOString()): LeaderboardEntry {
  return {
    runId: state.runId,
    mode: state.mode,
    dailyKey: state.dailyKey,
    background: state.background,
    days: state.day,
    peakNetWorth: state.stats.peakNetWorth,
    finalNetWorth: netWorth(state),
    cause: causeLabel(state),
    retired: state.phase === 'RETIRED',
    endedAt,
  };
}

/** 天數多的在前，同天數比淨值峰值。 */
export function rankEntries(entries: readonly LeaderboardEntry[]): LeaderboardEntry[] {
  return [...entries].sort((a, b) => b.days - a.days || b.peakNetWorth - a.peakNetWorth).slice(0, CONFIG.LEADERBOARD_SIZE);
}

export function loadLeaderboard(store: KeyValueStore): LeaderboardEntry[] {
  return rankEntries(readJson<LeaderboardEntry[]>(store, LEADERBOARD_KEY, []));
}

export function loadRuns(store: KeyValueStore): RunRecord[] {
  return readJson<RunRecord[]>(store, RUNLOG_KEY, []);
}

/** 一局結束：寫排行榜與 run 紀錄。同一個 runId 不重複寫。 */
export function recordRun(store: KeyValueStore, state: GameState, endedAt = new Date().toISOString()): void {
  const entries = loadLeaderboard(store);
  if (!entries.some((e) => e.runId === state.runId)) {
    writeJson(store, LEADERBOARD_KEY, rankEntries([...entries, toEntry(state, endedAt)]));
  }

  const runs = loadRuns(store);
  if (!runs.some((r) => r.runId === state.runId)) {
    const record: RunRecord = {
      runId: state.runId,
      seed: state.seed,
      endedAt,
      days: state.day,
      retired: state.phase === 'RETIRED',
      cause: causeLabel(state),
      stats: state.stats,
      history: state.history,
    };
    writeJson(store, RUNLOG_KEY, [...runs, record].slice(-CONFIG.RUNLOG_SIZE));
  }
}

export function exportRuns(store: KeyValueStore): string {
  return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), runs: loadRuns(store) }, null, 2);
}

/** 匯入：依 runId 去重後合併，回傳新增筆數。壞 JSON 丟錯。 */
export function importRuns(store: KeyValueStore, json: string): number {
  const parsed = JSON.parse(json) as { runs?: unknown };
  if (!Array.isArray(parsed.runs)) throw new Error('沒有 runs 陣列');
  const incoming = parsed.runs.filter(
    (r): r is RunRecord => typeof r === 'object' && r !== null && typeof (r as RunRecord).runId === 'string' && typeof (r as RunRecord).days === 'number',
  );
  const existing = loadRuns(store);
  const known = new Set(existing.map((r) => r.runId));
  const fresh = incoming.filter((r) => !known.has(r.runId));
  writeJson(store, RUNLOG_KEY, [...existing, ...fresh].slice(-CONFIG.RUNLOG_SIZE));

  const board = loadLeaderboard(store);
  const boardKnown = new Set(board.map((e) => e.runId));
  const boardFresh = fresh
    .filter((r) => !boardKnown.has(r.runId))
    .map<LeaderboardEntry>((r) => ({
      runId: r.runId,
      mode: 'free',
      dailyKey: null,
      background: 'normal',
      days: r.days,
      peakNetWorth: r.stats.peakNetWorth,
      finalNetWorth: 0,
      cause: r.cause,
      retired: r.retired,
      endedAt: r.endedAt,
    }));
  writeJson(store, LEADERBOARD_KEY, rankEntries([...board, ...boardFresh]));
  return fresh.length;
}

/** 瀏覽器用；localStorage 不可用時退成記憶體。 */
export function browserStore(): KeyValueStore {
  try {
    localStorage.getItem(LEADERBOARD_KEY);
    return localStorage;
  } catch {
    const mem = new Map<string, string>();
    return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v) };
  }
}
