import { createRng } from '../engine/rng';
import { createTitleState, reduce } from '../engine/reducer';
import type { DeathCause, GameState } from '../types';
import type { Policy } from './policies';

export interface RunResult {
  seed: number;
  days: number;
  ended: 'DEATH' | 'RETIRED' | 'TIMEOUT';
  cause: DeathCause | null;
  peakNetWorth: number;
  loansTaken: number;
  finalDebt: number;
}

export interface BatchOptions {
  runs: number;
  baseSeed: number;
  maxDays: number;
}

/** 單局：同一顆 seed 同時餵給 NEW_RUN 與 policy 的 rng，整局可重播。 */
export function simulateRun(policy: Policy, seed: number, maxDays: number): RunResult {
  const rng = createRng(seed);
  let state: GameState = reduce(createTitleState(), { type: 'NEW_RUN', seed, runId: `sim-${seed}`, mode: 'free', dailyKey: null, background: 'normal' });
  let guard = 0;

  while (state.phase !== 'DEATH' && state.phase !== 'RETIRED' && state.day <= maxDays) {
    const next = reduce(state, policy(state, rng));
    if (next === state && ++guard > 10) {
      throw new Error(`policy stuck at day ${state.day} phase ${state.phase}`);
    }
    if (next !== state) guard = 0;
    state = next;
  }

  return {
    seed,
    days: state.day,
    ended: state.phase === 'DEATH' ? 'DEATH' : state.phase === 'RETIRED' ? 'RETIRED' : 'TIMEOUT',
    cause: state.stats.causeOfDeath ?? null,
    peakNetWorth: state.stats.peakNetWorth,
    loansTaken: state.stats.loansTaken,
    finalDebt: state.debt,
  };
}

export function simulateBatch(policy: Policy, opts: BatchOptions): RunResult[] {
  const results: RunResult[] = [];
  for (let i = 0; i < opts.runs; i++) {
    results.push(simulateRun(policy, (opts.baseSeed + i) >>> 0, opts.maxDays));
  }
  return results;
}

export interface BatchSummary {
  runs: number;
  median: number;
  p10: number;
  p90: number;
  min: number;
  max: number;
  rentPct: number;
  sanityPct: number;
  otherDeathPct: number;
  retiredPct: number;
  timeoutPct: number;
  avgLoans: number;
  avgPeak: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[idx];
}

export function summarize(results: RunResult[]): BatchSummary {
  const days = results.map((r) => r.days).sort((a, b) => a - b);
  const n = results.length;
  const pct = (pred: (r: RunResult) => boolean) => (n === 0 ? 0 : (results.filter(pred).length / n) * 100);
  const avg = (pick: (r: RunResult) => number) => (n === 0 ? 0 : results.reduce((sum, r) => sum + pick(r), 0) / n);

  return {
    runs: n,
    median: percentile(days, 0.5),
    p10: percentile(days, 0.1),
    p90: percentile(days, 0.9),
    min: days[0] ?? 0,
    max: days[n - 1] ?? 0,
    rentPct: pct((r) => r.cause === 'RENT'),
    sanityPct: pct((r) => r.cause === 'SANITY'),
    otherDeathPct: pct((r) => r.ended === 'DEATH' && r.cause !== 'RENT' && r.cause !== 'SANITY'),
    retiredPct: pct((r) => r.ended === 'RETIRED'),
    timeoutPct: pct((r) => r.ended === 'TIMEOUT'),
    avgLoans: avg((r) => r.loansTaken),
    avgPeak: avg((r) => r.peakNetWorth),
  };
}
