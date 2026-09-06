/**
 * 資料檔的格式、解碼與驗證。
 * 這個檔案同時被瀏覽器 loader、vitest 與 build 前的驗證腳本使用，不能 import 任何 DOM 或 React。
 * 編碼規則見 scripts/build_segments.py 檔頭。
 */

export const PRICE_BASE = 10000; // 起點 = 10000 個基點
export const CRYPTO_LEN = 60;
export const STOCK_LEN = 160;
export const STOCK_PLAY_LEN = 120; // 遊戲實際用的長度，起點可在 0..40 之間隨機

export type Vol = 'low' | 'mid' | 'high';
export type Market = 'TW' | 'US';

/** [open, high, low, close]，單位是起點的萬分之一 */
export type Candle = [number, number, number, number];

export interface CryptoSegment {
  id: string;
  symbol: string;
  vol: Vol;
  candles: Candle[];
}

export interface StockSegment {
  id: string;
  market: Market;
  vol: Vol;
  closes: number[];
}

interface RawFile {
  version: number;
  generated: string;
  segments: unknown[];
}

const VOLS: readonly string[] = ['low', 'mid', 'high'];
const MARKETS: readonly string[] = ['TW', 'US'];

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

function isIntArray(x: unknown, len: number): x is number[] {
  return Array.isArray(x) && x.length === len && x.every((v) => Number.isInteger(v));
}

function parseFile(raw: unknown, name: string): RawFile {
  if (!isRecord(raw)) throw new Error(`${name}: not an object`);
  if (raw.version !== 1) throw new Error(`${name}: unsupported version ${String(raw.version)}`);
  if (!Array.isArray(raw.segments) || raw.segments.length === 0) throw new Error(`${name}: no segments`);
  return { version: 1, generated: String(raw.generated), segments: raw.segments };
}

export function decodeCandles(deltas: readonly (readonly number[])[]): Candle[] {
  const out: Candle[] = [];
  let prevClose = PRICE_BASE;
  for (const [dOpen, dHigh, dLow, dClose] of deltas) {
    const open = prevClose + dOpen;
    const high = open + dHigh;
    const low = open + dLow;
    const close = open + dClose;
    out.push([open, high, low, close]);
    prevClose = close;
  }
  return out;
}

export function decodeCloses(deltas: readonly number[]): number[] {
  const out: number[] = [];
  let prev = PRICE_BASE;
  for (const d of deltas) {
    prev += d;
    out.push(prev);
  }
  return out;
}

/** 解碼並驗證整個幣圈檔。任何一段壞掉就整檔拒絕，寧可 build 失敗也不讓壞資料上線。 */
export function parseCryptoFile(raw: unknown): CryptoSegment[] {
  const file = parseFile(raw, 'crypto_segments');
  const ids = new Set<string>();
  return file.segments.map((seg, i) => {
    if (!isRecord(seg)) throw new Error(`crypto[${i}]: not an object`);
    const { id, symbol, vol, d } = seg;
    if (typeof id !== 'string' || ids.has(id)) throw new Error(`crypto[${i}]: bad or duplicate id`);
    ids.add(id);
    if (typeof symbol !== 'string') throw new Error(`${id}: bad symbol`);
    if (typeof vol !== 'string' || !VOLS.includes(vol)) throw new Error(`${id}: bad vol`);
    if (!Array.isArray(d) || d.length !== CRYPTO_LEN || !d.every((row) => isIntArray(row, 4))) {
      throw new Error(`${id}: expected ${CRYPTO_LEN} candles of 4 ints`);
    }
    const candles = decodeCandles(d as number[][]);
    if (candles[0][3] !== PRICE_BASE) throw new Error(`${id}: first close must be ${PRICE_BASE}`);
    for (const [open, high, low, close] of candles) {
      if (low <= 0) throw new Error(`${id}: non-positive price`);
      if (high < Math.max(open, close) || low > Math.min(open, close)) throw new Error(`${id}: high/low inconsistent`);
    }
    return { id, symbol, vol: vol as Vol, candles };
  });
}

export function parseStockFile(raw: unknown): StockSegment[] {
  const file = parseFile(raw, 'stock_segments');
  const ids = new Set<string>();
  return file.segments.map((seg, i) => {
    if (!isRecord(seg)) throw new Error(`stock[${i}]: not an object`);
    const { id, market, vol, d } = seg;
    if (typeof id !== 'string' || ids.has(id)) throw new Error(`stock[${i}]: bad or duplicate id`);
    ids.add(id);
    if (typeof market !== 'string' || !MARKETS.includes(market)) throw new Error(`${id}: bad market`);
    if (typeof vol !== 'string' || !VOLS.includes(vol)) throw new Error(`${id}: bad vol`);
    if (!isIntArray(d, STOCK_LEN)) throw new Error(`${id}: expected ${STOCK_LEN} ints`);
    const closes = decodeCloses(d);
    if (closes[0] !== PRICE_BASE) throw new Error(`${id}: first close must be ${PRICE_BASE}`);
    for (let k = 0; k < closes.length; k++) {
      if (closes[k] <= 0) throw new Error(`${id}: non-positive price at ${k}`);
      if (k > 0 && Math.abs(closes[k] / closes[k - 1] - 1) > 0.35) throw new Error(`${id}: daily move over 35% at ${k}`);
    }
    return { id, market: market as Market, vol: vol as Vol, closes };
  });
}

export function parseCompanyNames(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length < 20) throw new Error('company_names: need at least 20 names');
  const names = raw.map((n) => {
    if (typeof n !== 'string' || n.length === 0) throw new Error('company_names: bad entry');
    return n;
  });
  if (new Set(names).size !== names.length) throw new Error('company_names: duplicates');
  return names;
}

// ---------------- NBA ----------------

export interface NbaOdds {
  home: number;
  away: number;
}

export interface NbaGame {
  id: string; // d{day}g{index}
  home: string;
  away: string;
  ml: NbaOdds;
  spread: { line: number; home: number; away: number }; // line 是主隊讓分，負數 = 主隊為熱門
  total: { line: number; over: number; under: number };
  score: { home: number; away: number };
}

export interface NbaGameDay {
  games: NbaGame[];
}

/** 讓分與大小分的固定價格（-110） */
export const NBA_SIDE_ODDS = 1.91;

export function parseNbaFile(raw: unknown): NbaGameDay[] {
  if (!isRecord(raw)) throw new Error('nba_games: not an object');
  if (raw.version !== 1) throw new Error(`nba_games: unsupported version ${String(raw.version)}`);
  const teams = raw.teams;
  if (!Array.isArray(teams) || teams.length < 2 || !teams.every((t) => typeof t === 'string' && t.length > 0)) {
    throw new Error('nba_games: bad teams');
  }
  const days = raw.days;
  if (!Array.isArray(days) || days.length === 0) throw new Error('nba_games: no days');

  return days.map((day, d) => {
    if (!Array.isArray(day) || day.length === 0) throw new Error(`nba day ${d}: empty`);
    const games = day.map((g, i) => {
      if (!isIntArray(g, 8)) throw new Error(`nba day ${d} game ${i}: expected 8 ints`);
      const [h, a, mlH, mlA, spread2, total2, hs, as] = g;
      if (h < 0 || h >= teams.length || a < 0 || a >= teams.length || h === a) throw new Error(`nba day ${d} game ${i}: bad teams`);
      if (mlH <= 1000 || mlA <= 1000) throw new Error(`nba day ${d} game ${i}: odds must be > 1`);
      if (total2 <= 0 || hs < 0 || as < 0) throw new Error(`nba day ${d} game ${i}: bad line or score`);
      const game: NbaGame = {
        id: `d${d}g${i}`,
        home: teams[h] as string,
        away: teams[a] as string,
        ml: { home: mlH / 1000, away: mlA / 1000 },
        spread: { line: spread2 / 2, home: NBA_SIDE_ODDS, away: NBA_SIDE_ODDS },
        total: { line: total2 / 2, over: NBA_SIDE_ODDS, under: NBA_SIDE_ODDS },
        score: { home: hs, away: as },
      };
      return game;
    });
    return { games };
  });
}
