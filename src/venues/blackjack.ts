import { CONFIG } from '../config';
import type { BjHand, BlackjackMove, Card } from '../types';
import { rankOf } from './cards';

/** A = 11（handValue 會視需要降成 1），10/J/Q/K = 10 */
export function cardPoints(card: Card): number {
  const rank = rankOf(card);
  if (rank === 0) return 11;
  if (rank >= 9) return 10;
  return rank + 1;
}

export interface HandValue {
  total: number;
  soft: boolean; // 還有一張 A 當 11 用
}

export function handValue(cards: readonly Card[]): HandValue {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    const p = cardPoints(c);
    total += p;
    if (p === 11) aces += 1;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return { total, soft: aces > 0 };
}

export function isBust(cards: readonly Card[]): boolean {
  return handValue(cards).total > 21;
}

/** 兩張 21。分牌後的手牌不算（由呼叫端用 fromSplit 排除）。 */
export function isNatural(cards: readonly Card[]): boolean {
  return cards.length === 2 && handValue(cards).total === 21;
}

export function canSplitCards(cards: readonly Card[]): boolean {
  return cards.length === 2 && cardPoints(cards[0]) === cardPoints(cards[1]);
}

export interface MoveOptions {
  canDouble: boolean;
  canSplit: boolean;
}

/**
 * 6 副牌、莊軟 17 停、可分牌一次、分牌後可加倍的基本策略表。
 * 不能加倍時的退路：硬牌 9/10/11 與軟牌一律要牌，唯 A7 改停牌。
 */
export function basicStrategy(cards: readonly Card[], dealerUp: Card, opts: MoveOptions): BlackjackMove {
  const up = cardPoints(dealerUp); // 2-11
  const { total, soft } = handValue(cards);
  const dbl = (fallback: BlackjackMove): BlackjackMove => (opts.canDouble ? 'double' : fallback);

  if (opts.canSplit && canSplitCards(cards)) {
    const pair = cardPoints(cards[0]);
    switch (pair) {
      case 11:
      case 8:
        return 'split';
      case 2:
      case 3:
      case 7:
        if (up >= 2 && up <= 7) return 'split';
        break;
      case 4:
        if (up === 5 || up === 6) return 'split';
        break;
      case 6:
        if (up >= 2 && up <= 6) return 'split';
        break;
      case 9:
        if ((up >= 2 && up <= 6) || up === 8 || up === 9) return 'split';
        return 'stand';
      case 10:
        return 'stand';
      default:
        break; // 5 5 當硬 10
    }
  }

  if (soft) {
    switch (total) {
      case 13:
      case 14:
        return up === 5 || up === 6 ? dbl('hit') : 'hit';
      case 15:
      case 16:
        return up >= 4 && up <= 6 ? dbl('hit') : 'hit';
      case 17:
        return up >= 3 && up <= 6 ? dbl('hit') : 'hit';
      case 18:
        if (up >= 3 && up <= 6) return dbl('stand');
        if (up === 2 || up === 7 || up === 8) return 'stand';
        return 'hit';
      default:
        return 'stand'; // 19-21
    }
  }

  if (total <= 8) return 'hit';
  if (total === 9) return up >= 3 && up <= 6 ? dbl('hit') : 'hit';
  if (total === 10) return up >= 2 && up <= 9 ? dbl('hit') : 'hit';
  if (total === 11) return up >= 2 && up <= 10 ? dbl('hit') : 'hit';
  if (total === 12) return up >= 4 && up <= 6 ? 'stand' : 'hit';
  if (total <= 16) return up >= 2 && up <= 6 ? 'stand' : 'hit';
  return 'stand';
}

export interface DealerPlay {
  dealer: Card[];
  cursor: number;
}

/** 莊家補到 17 以上，軟 17 停。 */
export function dealerPlay(shoe: readonly Card[], cursor: number, dealer: readonly Card[]): DealerPlay {
  const out = [...dealer];
  let next = cursor;
  while (handValue(out).total < 17) out.push(shoe[next++]);
  return { dealer: out, cursor: next };
}

/** 一手的退還總額（含本金）。 */
export function settleHand(hand: BjHand, dealer: readonly Card[]): number {
  const player = handValue(hand.cards).total;
  if (player > 21) return 0;

  const playerNatural = !hand.fromSplit && isNatural(hand.cards);
  const dealerNatural = isNatural(dealer);
  if (playerNatural) {
    if (dealerNatural) return hand.stake;
    return hand.stake + Math.floor(hand.stake * CONFIG.BLACKJACK_PAYOUT);
  }
  if (dealerNatural) return 0;

  const d = handValue(dealer).total;
  if (d > 21 || player > d) return hand.stake * 2;
  if (player === d) return hand.stake;
  return 0;
}

export function needsReshuffle(shoeLength: number, cursor: number): boolean {
  return shoeLength - cursor < CONFIG.BLACKJACK_CUT_CARD;
}
