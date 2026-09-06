import { rngStep } from '../engine/rng';
import type { Card } from '../types';

export const RANK_LABELS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;
export const SUIT_LABELS = ['♠', '♥', '♦', '♣'] as const;

export function rankOf(card: Card): number {
  return card % 13;
}

export function suitOf(card: Card): number {
  return Math.floor(card / 13);
}

export function cardLabel(card: Card): string {
  return `${RANK_LABELS[rankOf(card)]}${SUIT_LABELS[suitOf(card)]}`;
}

export function isRed(card: Card): boolean {
  const suit = suitOf(card);
  return suit === 1 || suit === 2;
}

export function buildShoe(decks: number): Card[] {
  const shoe: Card[] = [];
  for (let d = 0; d < decks; d++) for (let c = 0; c < 52; c++) shoe.push(c);
  return shoe;
}

export interface ShuffleResult {
  cards: Card[];
  rngState: number;
}

/** Fisher-Yates，亂數走 rngStep，結果可由 rngState 重播。 */
export function shuffle(cards: readonly Card[], rngState: number): ShuffleResult {
  const out = [...cards];
  let state = rngState;
  for (let i = out.length - 1; i > 0; i--) {
    const step = rngStep(state);
    state = step.state;
    const j = Math.floor(step.value * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return { cards: out, rngState: state };
}

export function newShoe(decks: number, rngState: number): ShuffleResult {
  return shuffle(buildShoe(decks), rngState);
}
