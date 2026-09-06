import { CONFIG } from '../config';
import type { VenueKind } from '../types';

export const TABLE_MIN: Record<VenueKind, number> = {
  baccarat: CONFIG.BACCARAT_MIN_BET,
  blackjack: CONFIG.BLACKJACK_MIN_BET,
  scratch: CONFIG.SCRATCH_TICKETS[0].price,
  crypto: CONFIG.CRYPTO_MIN_MARGIN,
  sicbo: CONFIG.SICBO_MIN_BET,
  niuniu: CONFIG.NIUNIU_MIN_BET,
  longmen: CONFIG.LONGMEN_MIN_BET,
};

/** 面額固定的場子不套用上頭 25% 規則，上頭只強制張數。 */
const FIXED_PRICE: Record<VenueKind, boolean> = {
  baccarat: false,
  blackjack: false,
  scratch: true,
  crypto: false,
  sicbo: false,
  niuniu: false,
  longmen: false,
};

/** 上頭時最小注碼是現金的 25%，否則桌最低。現金不足桌最低時回傳現金本身，讓 UI 能顯示「不夠下注」。 */
export function minBetFor(kind: VenueKind, cash: number, tilt: boolean): number {
  const tableMin = TABLE_MIN[kind];
  const floor = tilt && !FIXED_PRICE[kind] ? Math.max(tableMin, Math.ceil(cash * CONFIG.TILT_MIN_BET_RATIO)) : tableMin;
  return Math.min(floor, cash);
}

export function canBetAt(kind: VenueKind, cash: number): boolean {
  return cash >= TABLE_MIN[kind];
}

/** 注碼合法：整數、在 [最低, 現金] 內。 */
export function isValidStake(kind: VenueKind, stake: number, cash: number, tilt: boolean): boolean {
  if (!Number.isInteger(stake) || !canBetAt(kind, cash)) return false;
  return stake >= minBetFor(kind, cash, tilt) && stake <= cash;
}

/** 把想押的數字夾進 [最低, 現金]；現金低於最低時回傳最低，讓 UI 自行判斷禁用。 */
export function clampStake(value: number, min: number, cash: number): number {
  return Math.min(Math.max(value, min), Math.max(cash, min));
}
