import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import type { CryptoPosition } from '../types';
import {
  checkCandle,
  cryptoEdgeCost,
  entryPriceWithSlippage,
  grossPnl,
  isValidOpen,
  liquidationPrice,
  roiPrice,
  settle,
} from './crypto';

const long: CryptoPosition = {
  direction: 'long',
  leverage: 10,
  margin: 1000,
  entryPrice: 10000,
  entryIndex: 0,
  takeProfitPct: 100,
  stopLossPct: 50,
};
const short: CryptoPosition = { ...long, direction: 'short' };

describe('crypto math', () => {
  it('validates open params', () => {
    const base = { direction: 'long' as const, leverage: 10, margin: 1000, takeProfitPct: null, stopLossPct: null };
    expect(isValidOpen(base, 30000, false)).toBe(true);
    expect(isValidOpen({ ...base, margin: 400 }, 30000, false)).toBe(false);
    expect(isValidOpen({ ...base, margin: 1000 }, 30000, true)).toBe(false); // 上頭最低 7,500
    expect(isValidOpen({ ...base, leverage: 0 }, 30000, false)).toBe(false);
    expect(isValidOpen({ ...base, leverage: CONFIG.CRYPTO_MAX_LEVERAGE + 1 }, 30000, false)).toBe(false);
    expect(isValidOpen({ ...base, stopLossPct: 95 }, 30000, false)).toBe(false);
    expect(isValidOpen({ ...base, margin: 30001 }, 30000, false)).toBe(false);
  });

  it('slippage moves entry against you', () => {
    expect(entryPriceWithSlippage(10000, 'long')).toBeCloseTo(10002);
    expect(entryPriceWithSlippage(10000, 'short')).toBeCloseTo(9998);
  });

  it('liquidation and roi prices scale with leverage', () => {
    expect(liquidationPrice(long)).toBeCloseTo(10000 * (1 - 0.09));
    expect(liquidationPrice(short)).toBeCloseTo(10000 * (1 + 0.09));
    expect(roiPrice(long, 100)).toBeCloseTo(11000);
    expect(roiPrice(long, -50)).toBeCloseTo(9500);
    expect(roiPrice(short, 100)).toBeCloseTo(9000);
    expect(liquidationPrice({ ...long, leverage: 50 })).toBeCloseTo(10000 * (1 - 0.018));
  });

  it('gross pnl is notional times signed change', () => {
    expect(grossPnl(long, 10100)).toBe(100);
    expect(grossPnl(short, 10100)).toBe(-100);
    expect(grossPnl({ ...long, leverage: 50 }, 10100)).toBe(500);
  });

  it('checks liquidation before stop loss before take profit', () => {
    expect(checkCandle(long, [10000, 10050, 9950, 10020])).toEqual({ reason: null, price: 10020 });
    expect(checkCandle(long, [10000, 10050, 9400, 9450]).reason).toBe('sl');
    expect(checkCandle(long, [10000, 10050, 9400, 9450]).price).toBeCloseTo(9500);
    expect(checkCandle(long, [10000, 11100, 9950, 11000]).reason).toBe('tp');
    expect(checkCandle(long, [10000, 11100, 9000, 9100]).reason).toBe('liquidated');
    expect(checkCandle(short, [10000, 10950, 9990, 10900]).reason).toBe('liquidated');
    expect(checkCandle(short, [10000, 10520, 9990, 10500]).reason).toBe('sl');
    expect(checkCandle({ ...long, takeProfitPct: null, stopLossPct: null }, [10000, 11100, 9400, 9450])).toEqual({
      reason: null,
      price: 9450,
    });
  });

  it('settles with fees, floors at -margin, and zeroes on liquidation', () => {
    const fee = Math.round(10000 * CONFIG.CRYPTO_FEE); // 名目 10,000 單邊 5
    expect(settle(long, 10100, 'closed')).toEqual({ pnl: 100 - fee * 2, returned: 1000 + 100 - fee * 2 });
    expect(settle(long, 9000, 'sl')).toEqual({ pnl: -1000, returned: 0 });
    expect(settle(long, 9990, 'liquidated')).toEqual({ pnl: -1000, returned: 0 });
    expect(cryptoEdgeCost(10000)).toBeCloseTo(10000 * (2 * CONFIG.CRYPTO_FEE + CONFIG.CRYPTO_SLIPPAGE));
  });
});
