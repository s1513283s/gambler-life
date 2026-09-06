import { CONFIG } from '../config';
import type { BackgroundDef, GameState } from '../types';
import { stockMarketValue } from '../venues/stocks';

/** dailyExpense(day) = BASE x (1 + GROWTH)^(day-1) x multiplier，取整數元 */
export function expenseForDay(day: number, expenseMultiplier: number): number {
  const grown = CONFIG.BASE_EXPENSE * Math.pow(1 + CONFIG.EXPENSE_GROWTH, day - 1);
  return Math.round(grown * expenseMultiplier);
}

/** 淨值 = 現金 + 持股市值 - 債務。NBA 未結算注單不算資產。 */
export function netWorth(state: Pick<GameState, 'cash' | 'debt' | 'stockMarket' | 'stockPositions' | 'stockDayIndex'>): number {
  return state.cash + stockMarketValue(state) - state.debt;
}

/** 可借額度。利息可能讓債務超過上限，故 clamp 到 0。 */
export function loanRoom(debt: number): number {
  return Math.max(0, CONFIG.LOAN_CAP - debt);
}

/** 今晚利息。只對「今晚借款前」的本金計息，當晚自動借的缺口不計。 */
export function nightlyInterest(debtBeforeLoan: number): number {
  return Math.round(debtBeforeLoan * CONFIG.LOAN_DAILY_RATE);
}

export function clampSanity(value: number): number {
  return Math.min(CONFIG.SANITY_MAX, Math.max(0, Math.round(value)));
}

export function backgroundDef(id: GameState['background']): BackgroundDef {
  const def = CONFIG.BACKGROUNDS.find((b) => b.id === id);
  if (def === undefined) throw new Error(`unknown background ${id}`);
  return def;
}

export function wageFor(state: Pick<GameState, 'background'>): number {
  return backgroundDef(state.background).wage;
}

export function workSanityCostFor(state: Pick<GameState, 'background'>): number {
  return backgroundDef(state.background).workSanityCost;
}
