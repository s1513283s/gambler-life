import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CRYPTO_LEN,
  PRICE_BASE,
  STOCK_LEN,
  decodeCandles,
  decodeCloses,
  parseCompanyNames,
  parseCryptoFile,
  parseStockFile,
} from './schema';

const read = (name: string): unknown => JSON.parse(readFileSync(resolve(import.meta.dirname, name), 'utf8'));

describe('codec', () => {
  it('decodes candle deltas relative to the previous close', () => {
    const candles = decodeCandles([
      [0, 5, -3, 2],
      [-1, 0, -4, -4],
    ]);
    expect(candles).toEqual([
      [10000, 10005, 9997, 10002],
      [10001, 10001, 9997, 9997],
    ]);
  });

  it('decodes close deltas cumulatively', () => {
    expect(decodeCloses([0, 12, -5])).toEqual([10000, 10012, 10007]);
  });

  it('rejects malformed files', () => {
    expect(() => parseCryptoFile({ version: 2, segments: [] })).toThrow();
    expect(() => parseStockFile({ version: 1, segments: [{ id: 'x', market: 'JP', vol: 'low', d: [] }] })).toThrow();
    expect(() => parseCompanyNames(['a'])).toThrow();
    const bad = { version: 1, segments: [{ id: 'a', symbol: 'BTC', vol: 'low', d: Array.from({ length: CRYPTO_LEN }, () => [0, -1, 0, 0]) }] };
    expect(() => parseCryptoFile(bad)).toThrow(/high\/low/);
  });
});

describe('shipped data files', () => {
  it('crypto_segments.json is valid and normalized', () => {
    const segs = parseCryptoFile(read('crypto_segments.json'));
    expect(segs.length).toBeGreaterThanOrEqual(300);
    for (const s of segs) {
      expect(s.candles).toHaveLength(CRYPTO_LEN);
      expect(s.candles[0][3]).toBe(PRICE_BASE);
    }
    const vols = new Set(segs.map((s) => s.vol));
    expect(vols.size).toBe(3);
  });

  it('stock_segments.json is valid and normalized', () => {
    const segs = parseStockFile(read('stock_segments.json'));
    expect(segs.length).toBeGreaterThanOrEqual(200);
    for (const s of segs) {
      expect(s.closes).toHaveLength(STOCK_LEN);
      expect(s.closes[0]).toBe(PRICE_BASE);
    }
    expect(new Set(segs.map((s) => s.market)).size).toBe(2);
  });

  it('company_names.json has enough unique names', () => {
    expect(parseCompanyNames(read('company_names.json')).length).toBeGreaterThanOrEqual(60);
  });
});
