import { CONFIG } from '../config';
import { rngStep } from '../engine/rng';
import type { SicboBet } from '../types';

export interface DiceRoll {
  dice: [number, number, number];
  rngState: number;
}

export function rollDice(rngState: number): DiceRoll {
  let state = rngState;
  const dice: number[] = [];
  for (let i = 0; i < 3; i++) {
    const step = rngStep(state);
    state = step.state;
    dice.push(1 + Math.floor(step.value * 6));
  }
  return { dice: [dice[0], dice[1], dice[2]], rngState: state };
}

export function isTriple(dice: readonly number[]): boolean {
  return dice[0] === dice[1] && dice[1] === dice[2];
}

/** 退還總額（含本金）。大小遇圍骰通吃。 */
export function sicboPayout(bet: SicboBet, stake: number, dice: readonly number[]): number {
  const sum = dice[0] + dice[1] + dice[2];
  const triple = isTriple(dice);
  switch (bet.kind) {
    case 'big':
      return !triple && sum >= 11 && sum <= 17 ? stake * 2 : 0;
    case 'small':
      return !triple && sum >= 4 && sum <= 10 ? stake * 2 : 0;
    case 'anyTriple':
      return triple ? stake + stake * CONFIG.SICBO_ANY_TRIPLE_PAYOUT : 0;
    case 'triple':
      return triple && dice[0] === bet.face ? stake + stake * CONFIG.SICBO_TRIPLE_PAYOUT : 0;
  }
}

export function sicboEdge(bet: SicboBet): number {
  return CONFIG.SICBO_EDGE[bet.kind];
}

export function isValidSicboBet(bet: SicboBet): boolean {
  return bet.kind !== 'triple' || (Number.isInteger(bet.face) && bet.face >= 1 && bet.face <= 6);
}
