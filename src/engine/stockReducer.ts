import { CONFIG } from '../config';
import type { StockSegment } from '../data/schema';
import type { GameState, StockPosition } from '../types';
import {
  buildMarket,
  buyFee,
  positionValue,
  priceAt,
  sellCosts,
  stockEdge,
  toDollars,
  unrealizedPct,
} from '../venues/stocks';
import { clampSanity } from './economy';
import { applyRoundResult, recordWager, winLossSanity } from './venueShared';

/** STOCK_OPEN_MARKET：整局只建一次。 */
export function stockOpenMarket(state: GameState, pool: readonly StockSegment[], names: readonly string[]): GameState {
  if (state.stockMarket !== null) return state;
  const built = buildMarket(pool, names, state.rngState);
  return {
    ...state,
    rngState: built.rngState,
    stockMarket: built.slots,
    stockDayIndex: CONFIG.STOCK_VISIBLE_HISTORY,
  };
}

function tradeSanity(state: GameState): GameState {
  return { ...state, sanity: clampSanity(state.sanity - CONFIG.STOCK_TRADE_SANITY_COST) };
}

/** STOCK_BUY：付 amount，扣手續費後換成股數。 */
export function stockBuy(state: GameState, slot: number, rawAmount: number): GameState {
  const market = state.stockMarket;
  if (market === null || slot < 0 || slot >= market.length) return state;
  const amount = Math.floor(rawAmount);
  if (!Number.isFinite(amount) || amount < CONFIG.STOCK_MIN_LOT || amount > state.cash) return state;

  const price = priceAt(market[slot], state.stockDayIndex);
  const invested = amount - buyFee(amount);
  const units = invested / toDollars(price);

  const existing = state.stockPositions.find((p) => p.slot === slot);
  let positions: StockPosition[];
  if (existing === undefined) {
    positions = [...state.stockPositions, { slot, units, avgCost: price }];
  } else {
    const totalUnits = existing.units + units;
    const avgCost = (existing.avgCost * existing.units + price * units) / totalUnits;
    positions = state.stockPositions.map((p) => (p.slot === slot ? { slot, units: totalUnits, avgCost } : p));
  }

  const byVenue = { ...state.stats.byVenue };
  byVenue.stocks = { ...byVenue.stocks, sessions: byVenue.stocks.sessions + 1 };
  const wagered = recordWager({ ...state, stats: { ...state.stats, byVenue } }, 'stocks', amount, amount * stockEdge());
  return tradeSanity({ ...wagered, cash: state.cash - amount, stockPositions: positions });
}

/** STOCK_SELL：賣一半或全部，扣手續費與證交稅，實現損益計精神。 */
export function stockSell(state: GameState, slot: number, fraction: 0.5 | 1): GameState {
  const market = state.stockMarket;
  const pos = state.stockPositions.find((p) => p.slot === slot);
  if (market === null || pos === undefined) return state;

  const price = priceAt(market[slot], state.stockDayIndex);
  const units = fraction === 1 ? pos.units : pos.units / 2;
  const gross = Math.floor(units * toDollars(price));
  if (gross <= 0) return state;
  const proceeds = gross - sellCosts(gross);
  const costBasis = Math.round(units * toDollars(pos.avgCost));
  const realized = proceeds - costBasis;

  const remaining = pos.units - units;
  const positions =
    fraction === 1 || remaining <= 1e-9
      ? state.stockPositions.filter((p) => p.slot !== slot)
      : state.stockPositions.map((p) => (p.slot === slot ? { ...p, units: remaining } : p));

  const byVenue = { ...state.stats.byVenue };
  byVenue.stocks = { ...byVenue.stocks, sessions: byVenue.stocks.sessions + 1 };
  const sold: GameState = {
    ...state,
    cash: state.cash + proceeds,
    stockPositions: positions,
    stats: { ...state.stats, byVenue },
  };
  const settled = applyRoundResult(sold, 'stocks', realized, winLossSanity(realized));
  const next = tradeSanity(settled);
  // 砍倉步驟中賣出：更新還差多少
  if (next.night?.step === 'LIQUIDATE') {
    return { ...next, night: { step: 'LIQUIDATE', shortfall: Math.max(0, next.dailyExpense - next.cash) } };
  }
  return next;
}

/** NIGHT 收盤：日線前進一天；任何持股浮虧超過 20% 就多扣精神（每天一次）。 */
export function stockNightlyClose(state: GameState): GameState {
  const market = state.stockMarket;
  if (market === null) return state;
  const dayIndex = state.stockDayIndex + 1;
  const underwater = state.stockPositions.some(
    (p) => unrealizedPct(p, priceAt(market[p.slot], dayIndex)) < -CONFIG.STOCK_UNDERWATER_RATIO,
  );
  return {
    ...state,
    stockDayIndex: dayIndex,
    sanity: underwater ? clampSanity(state.sanity - CONFIG.STOCK_UNDERWATER_SANITY) : state.sanity,
  };
}

/** 持股全部變現能拿回多少（扣稅費），砍倉詢問用 */
export function liquidationValue(state: GameState): number {
  const market = state.stockMarket;
  if (market === null) return 0;
  return state.stockPositions.reduce((sum, p) => {
    const gross = positionValue(p, priceAt(market[p.slot], state.stockDayIndex));
    return sum + gross - sellCosts(gross);
  }, 0);
}
