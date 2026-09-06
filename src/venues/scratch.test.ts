import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { jackpotProbability, rollPrize, ticketDef, ticketRtp, winProbability } from './scratch';

describe('scratch prize table', () => {
  it('every denomination pays exactly the configured RTP', () => {
    expect(ticketRtp()).toBeCloseTo(CONFIG.SCRATCH_RTP, 6);
  });

  it('the break-even tier carries about 70% of the prize mass', () => {
    const breakEven = CONFIG.SCRATCH_TIERS.find((t) => t.multiplier === 1);
    expect(breakEven).toBeDefined();
    const share = (breakEven?.p ?? 0) / CONFIG.SCRATCH_RTP;
    expect(share).toBeGreaterThan(0.65);
    expect(share).toBeLessThan(0.75);
  });

  it('jackpot probability scales so its RTP share is constant', () => {
    for (const def of CONFIG.SCRATCH_TICKETS) {
      expect(jackpotProbability(def) * def.jackpot).toBeCloseTo(CONFIG.SCRATCH_JACKPOT_RTP * def.price, 9);
    }
    expect(jackpotProbability({ price: 100, jackpot: 10000 })).toBeCloseTo(1 / 20000, 9);
  });

  it('rolls match the table over 200k tickets', () => {
    const def = ticketDef(100);
    expect(def).not.toBeNull();
    if (def === null) return;
    let rng = 777;
    let returned = 0;
    let breakEven = 0;
    let anyWin = 0;
    const n = 200000;
    for (let i = 0; i < n; i++) {
      const roll = rollPrize(def, rng);
      rng = roll.rngState;
      returned += roll.prize;
      if (roll.prize === def.price) breakEven += 1;
      if (roll.prize > 0) anyWin += 1;
    }
    // 頭獎機率 1/20000，20 萬張大約 10 次，波動大；不含頭獎的 RTP 應在 0.545 上下
    const rtp = returned / (n * def.price);
    expect(rtp).toBeGreaterThan(0.5);
    expect(rtp).toBeLessThan(0.62);
    expect(breakEven / n).toBeCloseTo(0.385, 2);
    expect(anyWin / n).toBeCloseTo(winProbability(def), 2);
  });

  it('unknown price is rejected', () => {
    expect(ticketDef(150)).toBeNull();
  });
});
