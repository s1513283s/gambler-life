import { CONFIG } from '../config';
import { rngStep } from '../engine/rng';

export interface TicketDef {
  price: number;
  jackpot: number;
}

export function ticketDef(price: number): TicketDef | null {
  return CONFIG.SCRATCH_TICKETS.find((t) => t.price === price) ?? null;
}

export function jackpotProbability(def: TicketDef): number {
  return (CONFIG.SCRATCH_JACKPOT_RTP * def.price) / def.jackpot;
}

/** 理論 RTP，每個面額都一樣，應等於 CONFIG.SCRATCH_RTP。 */
export function ticketRtp(): number {
  const tiers = CONFIG.SCRATCH_TIERS.reduce((sum, t) => sum + t.multiplier * t.p, 0);
  return tiers + CONFIG.SCRATCH_JACKPOT_RTP;
}

/** 中任何獎（含回本）的機率 */
export function winProbability(def: TicketDef): number {
  return CONFIG.SCRATCH_TIERS.reduce((sum, t) => sum + t.p, 0) + jackpotProbability(def);
}

export interface PrizeRoll {
  prize: number;
  rngState: number;
}

/** 擲一張：先看頭獎，再依序看各級，都沒中就是銘謝惠顧。 */
export function rollPrize(def: TicketDef, rngState: number): PrizeRoll {
  const step = rngStep(rngState);
  let cursor = step.value;

  const jackpotP = jackpotProbability(def);
  if (cursor < jackpotP) return { prize: def.jackpot, rngState: step.state };
  cursor -= jackpotP;

  for (const tier of CONFIG.SCRATCH_TIERS) {
    if (cursor < tier.p) return { prize: def.price * tier.multiplier, rngState: step.state };
    cursor -= tier.p;
  }
  return { prize: 0, rngState: step.state };
}

/** EV 記帳：注金 x (1 - RTP) */
export function scratchEdge(): number {
  return 1 - CONFIG.SCRATCH_RTP;
}
