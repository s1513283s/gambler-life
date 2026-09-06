import { describe, expect, it } from 'vitest';
import { createRng, rngStep } from '../engine/rng';
import { POLICIES } from './policies';
import { simulateBatch, simulateRun, summarize } from './runner';

describe('rng', () => {
  it('is deterministic and serializable', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = [a.next(), a.next(), a.next()];
    const seqB = [b.next(), b.next(), b.next()];
    expect(seqA).toEqual(seqB);
    expect(rngStep(a.state()).value).toBe(b.next());
  });

  it('stays inside [0, 1) and int() inside [0, n)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      const k = rng.int(6);
      expect(k).toBeGreaterThanOrEqual(0);
      expect(k).toBeLessThan(6);
    }
  });
});

describe('simulator', () => {
  it('every built-in policy reaches an ending', () => {
    for (const [name, policy] of Object.entries(POLICIES)) {
      const r = simulateRun(policy, 1, 365);
      expect(r.ended, name).toBe('DEATH');
      expect(r.days, name).toBeGreaterThan(0);
    }
  });

  it('same seed reproduces the same run', () => {
    const a = simulateRun(POLICIES.coinFlip, 99, 365);
    const b = simulateRun(POLICIES.coinFlip, 99, 365);
    expect(a).toEqual(b);
  });

  it('summarizes a batch', () => {
    const s = summarize(simulateBatch(POLICIES.coinFlip, { runs: 50, baseSeed: 1, maxDays: 365 }));
    expect(s.runs).toBe(50);
    expect(s.min).toBeLessThanOrEqual(s.median);
    expect(s.median).toBeLessThanOrEqual(s.max);
    expect(s.rentPct + s.sanityPct + s.retiredPct + s.timeoutPct).toBeCloseTo(100);
  });
});
