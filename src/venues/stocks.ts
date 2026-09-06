import { CONFIG } from '../config';
import { PRICE_BASE, type StockSegment } from '../data/schema';
import { rngStep } from '../engine/rng';
import type { GameState, StockPosition, StockSlot } from '../types';

/** 從 offset 起重新正規化，讓該日 = 10000 */
export function renormalize(closes: readonly number[], offset: number): number[] {
  const base = closes[offset];
  return closes.slice(offset).map((c) => Math.round((c * PRICE_BASE) / base));
}

/** 把 next 接到 base 後面，next 的第一天對齊 base 的最後一天，再丟掉重疊那天。 */
export function chain(base: readonly number[], next: readonly number[]): number[] {
  const last = base[base.length - 1];
  const scale = last / next[0];
  return [...base, ...next.slice(1).map((c) => Math.round(c * scale))];
}

export interface MarketBuild {
  slots: StockSlot[];
  rngState: number;
}

/** 抽五支不重複的切片與公司名，每支預先接續 CHAIN_SEGMENTS 段。 */
export function buildMarket(pool: readonly StockSegment[], names: readonly string[], rngState: number): MarketBuild {
  const size = CONFIG.STOCK_MARKET_SIZE;
  const perSlot = CONFIG.STOCK_CHAIN_SEGMENTS;
  if (pool.length < size * perSlot || names.length < size) throw new Error('stock pool or names too small');

  let state = rngState;
  const draw = (n: number): number => {
    const step = rngStep(state);
    state = step.state;
    return Math.floor(step.value * n);
  };

  const segIdx = new Set<number>();
  while (segIdx.size < size * perSlot) segIdx.add(draw(pool.length));
  const nameIdx = new Set<number>();
  while (nameIdx.size < size) nameIdx.add(draw(names.length));

  const segs = [...segIdx].map((i) => pool[i]);
  const picked = [...nameIdx].map((i) => names[i]);

  const slots: StockSlot[] = [];
  for (let s = 0; s < size; s++) {
    const mine = segs.slice(s * perSlot, (s + 1) * perSlot);
    const offset = draw(CONFIG.STOCK_START_OFFSET_MAX + 1);
    let closes = renormalize(mine[0].closes, offset);
    for (const seg of mine.slice(1)) closes = chain(closes, seg.closes);
    slots.push({ name: picked[s], segmentIds: mine.map((m) => m.id), closes });
  }
  return { slots, rngState: state };
}

/** 今日收盤，index 超出時凍結在最後一天 */
export function priceAt(slot: StockSlot, dayIndex: number): number {
  return slot.closes[Math.min(dayIndex, slot.closes.length - 1)];
}

/** 基點 → 元 */
export function toDollars(bp: number): number {
  return bp / 100;
}

export function buyFee(amount: number): number {
  return Math.round(amount * CONFIG.STOCK_FEE);
}

export function sellCosts(gross: number): number {
  return Math.round(gross * CONFIG.STOCK_FEE) + Math.round(gross * CONFIG.STOCK_TAX);
}

/** EV 記帳比例：買賣手續費各一次加證交稅 */
export function stockEdge(): number {
  return 2 * CONFIG.STOCK_FEE + CONFIG.STOCK_TAX;
}

/** 持股市值（元，整數） */
export function positionValue(pos: StockPosition, price: number): number {
  return Math.floor(pos.units * toDollars(price));
}

export function unrealizedPct(pos: StockPosition, price: number): number {
  return price / pos.avgCost - 1;
}

export function stockMarketValue(state: Pick<GameState, 'stockMarket' | 'stockPositions' | 'stockDayIndex'>): number {
  if (state.stockMarket === null) return 0;
  const market = state.stockMarket;
  return state.stockPositions.reduce((sum, p) => sum + positionValue(p, priceAt(market[p.slot], state.stockDayIndex)), 0);
}
