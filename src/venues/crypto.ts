import { CONFIG } from '../config';
import type { Candle } from '../data/schema';
import type { CryptoDirection, CryptoExitReason, CryptoPosition } from '../types';
import { minBetFor } from './betting';

export interface OpenParams {
  direction: CryptoDirection;
  leverage: number;
  margin: number;
  takeProfitPct: number | null;
  stopLossPct: number | null;
}

export function isValidOpen(p: OpenParams, cash: number, tilt: boolean): boolean {
  if (!Number.isInteger(p.margin) || !Number.isInteger(p.leverage)) return false;
  if (p.leverage < 1 || p.leverage > CONFIG.CRYPTO_MAX_LEVERAGE) return false;
  if (cash < CONFIG.CRYPTO_MIN_MARGIN) return false;
  if (p.margin < minBetFor('crypto', cash, tilt) || p.margin > cash) return false;
  if (p.takeProfitPct !== null && p.takeProfitPct <= 0) return false;
  if (p.stopLossPct !== null && (p.stopLossPct <= 0 || p.stopLossPct >= CONFIG.LIQ_RATIO * 100)) return false;
  return true;
}

export function notionalOf(pos: Pick<CryptoPosition, 'margin' | 'leverage'>): number {
  return pos.margin * pos.leverage;
}

/** 滑點：成交價往不利方向偏 */
export function entryPriceWithSlippage(marketPrice: number, direction: CryptoDirection): number {
  const slip = direction === 'long' ? 1 + CONFIG.CRYPTO_SLIPPAGE : 1 - CONFIG.CRYPTO_SLIPPAGE;
  return marketPrice * slip;
}

/** 單邊手續費，算在名目部位上 */
export function sideFee(notional: number): number {
  return Math.round(notional * CONFIG.CRYPTO_FEE);
}

/** EV 記帳：名目部位 x (開平倉手續費 + 滑點) */
export function cryptoEdgeCost(notional: number): number {
  return notional * (2 * CONFIG.CRYPTO_FEE + CONFIG.CRYPTO_SLIPPAGE);
}

/** 價格走到這裡，未實現虧損就等於保證金 x LIQ_RATIO */
export function liquidationPrice(pos: CryptoPosition): number {
  const move = CONFIG.LIQ_RATIO / pos.leverage;
  return pos.direction === 'long' ? pos.entryPrice * (1 - move) : pos.entryPrice * (1 + move);
}

/** 保證金報酬率 pct% 對應的價格 */
export function roiPrice(pos: CryptoPosition, pct: number): number {
  const move = pct / 100 / pos.leverage;
  return pos.direction === 'long' ? pos.entryPrice * (1 + move) : pos.entryPrice * (1 - move);
}

/** 未扣手續費的損益 */
export function grossPnl(pos: CryptoPosition, price: number): number {
  const change = price / pos.entryPrice - 1;
  const signed = pos.direction === 'long' ? change : -change;
  return Math.round(notionalOf(pos) * signed);
}

export interface CandleCheck {
  reason: CryptoExitReason | null;
  price: number;
}

/**
 * 一根 K 內依序檢查：爆倉 > 停損 > 停利。同一根同時碰到時保守處理，先算壞的。
 * 用 high / low 判定，觸價就照設定價成交。
 */
export function checkCandle(pos: CryptoPosition, candle: Candle): CandleCheck {
  const [, high, low] = candle;
  const long = pos.direction === 'long';
  const worst = long ? low : high;
  const best = long ? high : low;

  const liq = liquidationPrice(pos);
  if (long ? worst <= liq : worst >= liq) return { reason: 'liquidated', price: liq };

  if (pos.stopLossPct !== null) {
    const sl = roiPrice(pos, -pos.stopLossPct);
    if (long ? worst <= sl : worst >= sl) return { reason: 'sl', price: sl };
  }
  if (pos.takeProfitPct !== null) {
    const tp = roiPrice(pos, pos.takeProfitPct);
    if (long ? best >= tp : best <= tp) return { reason: 'tp', price: tp };
  }
  return { reason: null, price: candle[3] };
}

export interface Settlement {
  pnl: number; // 已扣手續費
  returned: number; // 回到現金的金額 = margin + pnl，最低 0
}

/** 爆倉保證金歸零；其餘扣開倉與平倉手續費，虧損最多到保證金。 */
export function settle(pos: CryptoPosition, exitPrice: number, reason: CryptoExitReason): Settlement {
  if (reason === 'liquidated') return { pnl: -pos.margin, returned: 0 };
  const notional = notionalOf(pos);
  const pnl = Math.max(-pos.margin, grossPnl(pos, exitPrice) - sideFee(notional) * 2);
  return { pnl, returned: pos.margin + pnl };
}
