import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { createTitleState, reduce } from '../engine/reducer';
import type { GameState } from '../types';
import { exportRuns, importRuns, loadLeaderboard, loadRuns, rankEntries, recordRun, type KeyValueStore } from './runlog';

function memStore(): KeyValueStore {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

function deadRun(runId: string, days: number, peak = 30000): GameState {
  const s = reduce(createTitleState(), { type: 'NEW_RUN', seed: 1, runId, mode: 'free', dailyKey: null, background: 'normal' });
  return { ...s, phase: 'DEATH', day: days, stats: { ...s.stats, peakNetWorth: peak, causeOfDeath: 'RENT' }, history: [] };
}

describe('runlog', () => {
  it('records a finished run once into both stores', () => {
    const store = memStore();
    const s = deadRun('r1', 42);
    recordRun(store, s, '2026-09-06T00:00:00Z');
    recordRun(store, s, '2026-09-06T00:00:01Z');
    expect(loadLeaderboard(store)).toHaveLength(1);
    expect(loadRuns(store)).toHaveLength(1);
    expect(loadLeaderboard(store)[0]).toMatchObject({ runId: 'r1', days: 42, cause: '付不出房租', retired: false });
  });

  it('ranks by days then peak and caps the board', () => {
    const store = memStore();
    for (let i = 0; i < 15; i++) recordRun(store, deadRun(`r${i}`, 10 + (i % 5), 1000 * i));
    const board = loadLeaderboard(store);
    expect(board).toHaveLength(CONFIG.LEADERBOARD_SIZE);
    expect(board[0].days).toBe(14);
    for (let i = 1; i < board.length; i++) {
      const a = board[i - 1];
      const b = board[i];
      expect(a.days > b.days || (a.days === b.days && a.peakNetWorth >= b.peakNetWorth)).toBe(true);
    }
    expect(rankEntries([]).length).toBe(0);
  });

  it('caps the run log and round-trips export/import with dedupe', () => {
    const store = memStore();
    for (let i = 0; i < CONFIG.RUNLOG_SIZE + 5; i++) recordRun(store, deadRun(`run${i}`, 20));
    expect(loadRuns(store)).toHaveLength(CONFIG.RUNLOG_SIZE);

    const json = exportRuns(store);
    const other = memStore();
    expect(importRuns(other, json)).toBe(CONFIG.RUNLOG_SIZE);
    expect(importRuns(other, json)).toBe(0);
    expect(loadLeaderboard(other)).toHaveLength(CONFIG.LEADERBOARD_SIZE);
    expect(() => importRuns(other, '{"nope":1}')).toThrow();
    expect(() => importRuns(other, 'not json')).toThrow();
  });

  it('labels retired runs', () => {
    const store = memStore();
    const s = { ...deadRun('z', 90), phase: 'RETIRED' as const };
    recordRun(store, s);
    expect(loadLeaderboard(store)[0]).toMatchObject({ cause: '上岸', retired: true });
  });
});
