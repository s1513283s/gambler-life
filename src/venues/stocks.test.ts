import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import type { StockSegment } from '../data/schema';
import { buildMarket, chain, positionValue, priceAt, renormalize, sellCosts, buyFee, unrealizedPct } from './stocks';

function seg(id: string, start: number, step: number): StockSegment {
  return { id, market: 'TW', vol: 'mid', closes: Array.from({ length: 160 }, (_, i) => start + i * step) };
}

describe('stocks helpers', () => {
  it('renormalizes from an offset', () => {
    expect(renormalize([200, 400, 800], 1)).toEqual([10000, 20000]);
  });

  it('chains segments continuously', () => {
    const out = chain([10000, 12000], [10000, 11000, 9000]);
    expect(out).toEqual([10000, 12000, 13200, 10800]);
  });

  it('builds a market of distinct segments and names with chained closes', () => {
    const pool = Array.from({ length: 20 }, (_, i) => seg(`s${i}`, 100 + i, 1));
    const names = Array.from({ length: 10 }, (_, i) => `公司${i}`);
    const a = buildMarket(pool, names, 42);
    const b = buildMarket(pool, names, 42);
    expect(a.slots).toEqual(b.slots);
    expect(a.slots).toHaveLength(CONFIG.STOCK_MARKET_SIZE);
    const allIds = a.slots.flatMap((s) => s.segmentIds);
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(new Set(a.slots.map((s) => s.name)).size).toBe(a.slots.length);
    for (const s of a.slots) {
      expect(s.closes[0]).toBe(10000);
      expect(s.closes.length).toBeGreaterThanOrEqual(160 - CONFIG.STOCK_START_OFFSET_MAX + 159 * (CONFIG.STOCK_CHAIN_SEGMENTS - 1));
    }
    expect(() => buildMarket(pool.slice(0, 3), names, 1)).toThrow();
  });

  it('freezes price past the end, values positions in dollars', () => {
    const slot = { name: 'x', segmentIds: [], closes: [10000, 11000] };
    expect(priceAt(slot, 5)).toBe(11000);
    const pos = { slot: 0, units: 10, avgCost: 10000 };
    expect(positionValue(pos, 11000)).toBe(1100);
    expect(unrealizedPct(pos, 8000)).toBeCloseTo(-0.2);
    expect(buyFee(10000)).toBe(14);
    expect(sellCosts(10000)).toBe(14 + 30);
  });
});
