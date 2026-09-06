import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import type { BjHand, Card } from '../types';
import {
  basicStrategy,
  canSplitCards,
  cardPoints,
  dealerPlay,
  handValue,
  isNatural,
  settleHand,
} from './blackjack';
import { newShoe } from './cards';

// 花色 0：rank 索引就是牌號
const A = 0;
const TWO = 1;
const THREE = 2;
const FIVE = 4;
const SIX = 5;
const SEVEN = 6;
const EIGHT = 7;
const NINE = 8;
const TEN = 9;
const K = 12;
const hand = (cards: Card[], stake = 1000, fromSplit = false): BjHand => ({ cards, stake, done: true, fromSplit });

describe('blackjack values', () => {
  it('counts aces as 11 then 1', () => {
    expect(cardPoints(A)).toBe(11);
    expect(cardPoints(K)).toBe(10);
    expect(handValue([A, SIX])).toEqual({ total: 17, soft: true });
    expect(handValue([A, SIX, TEN])).toEqual({ total: 17, soft: false });
    expect(handValue([A, A])).toEqual({ total: 12, soft: true });
    expect(isNatural([A, K])).toBe(true);
    expect(isNatural([A, FIVE, FIVE])).toBe(false);
    expect(canSplitCards([TEN, K])).toBe(true);
    expect(canSplitCards([NINE, TEN])).toBe(false);
  });
});

describe('basic strategy', () => {
  const both = { canDouble: true, canSplit: true };
  const noDouble = { canDouble: false, canSplit: false };

  it('follows the S17 chart on classic spots', () => {
    expect(basicStrategy([TEN, SIX], TEN, both)).toBe('hit');
    expect(basicStrategy([TEN, SIX], SIX, both)).toBe('stand');
    expect(basicStrategy([TEN, TWO], THREE, both)).toBe('hit');
    expect(basicStrategy([TEN, TWO], FIVE, both)).toBe('stand');
    expect(basicStrategy([FIVE, SIX], A, both)).toBe('hit');
    expect(basicStrategy([FIVE, SIX], TEN, both)).toBe('double');
    expect(basicStrategy([FIVE, FIVE], NINE, both)).toBe('double');
    expect(basicStrategy([EIGHT, EIGHT], TEN, both)).toBe('split');
    expect(basicStrategy([A, A], TEN, both)).toBe('split');
    expect(basicStrategy([NINE, NINE], SEVEN, both)).toBe('stand');
    expect(basicStrategy([NINE, NINE], NINE, both)).toBe('split');
    expect(basicStrategy([TEN, TEN], SIX, both)).toBe('stand');
    expect(basicStrategy([A, SEVEN], NINE, both)).toBe('hit');
    expect(basicStrategy([A, SEVEN], THREE, both)).toBe('double');
    expect(basicStrategy([A, SEVEN], TWO, both)).toBe('stand');
    expect(basicStrategy([A, EIGHT], SIX, both)).toBe('stand');
  });

  it('falls back when double or split is unavailable', () => {
    expect(basicStrategy([FIVE, SIX], TEN, noDouble)).toBe('hit');
    expect(basicStrategy([A, SEVEN], THREE, noDouble)).toBe('stand');
    expect(basicStrategy([A, SIX], THREE, noDouble)).toBe('hit');
    expect(basicStrategy([EIGHT, EIGHT], TEN, noDouble)).toBe('hit');
    expect(basicStrategy([TEN, TEN], SIX, noDouble)).toBe('stand');
  });
});

describe('dealer and settlement', () => {
  it('dealer stands on soft 17 and draws to 17+', () => {
    expect(dealerPlay([], 0, [A, SIX]).dealer).toEqual([A, SIX]);
    const drawn = dealerPlay([FIVE, K], 0, [TEN, SIX]);
    expect(drawn.dealer).toEqual([TEN, SIX, FIVE]);
    expect(drawn.cursor).toBe(1);
  });

  it('pays 3:2 on natural, pushes vs dealer natural, and 1:1 otherwise', () => {
    expect(settleHand(hand([A, K]), [TEN, NINE])).toBe(2500);
    expect(settleHand(hand([A, K]), [A, TEN])).toBe(1000);
    expect(settleHand(hand([A, K], 1000, true), [TEN, NINE])).toBe(2000);
    expect(settleHand(hand([TEN, NINE]), [A, TEN])).toBe(0);
    expect(settleHand(hand([TEN, NINE]), [TEN, SEVEN])).toBe(2000);
    expect(settleHand(hand([TEN, SEVEN]), [TEN, SEVEN])).toBe(1000);
    expect(settleHand(hand([TEN, SIX]), [TEN, SEVEN])).toBe(0);
    expect(settleHand(hand([TEN, SIX, K]), [TEN, SIX, K]), 'player bust loses even if dealer busts').toBe(0);
    expect(settleHand(hand([TEN, SIX]), [TEN, SIX, K])).toBe(2000);
  });

  it('basic strategy without splits keeps the house edge under 1.5% over 100k hands', () => {
    let rng = 4242;
    let shoe = newShoe(6, rng);
    rng = shoe.rngState;
    let cursor = 0;
    let wagered = 0;
    let returned = 0;
    for (let i = 0; i < 100000; i++) {
      if (shoe.cards.length - cursor < CONFIG.BLACKJACK_CUT_CARD) {
        shoe = newShoe(6, rng);
        rng = shoe.rngState;
        cursor = 0;
      }
      const cards = shoe.cards;
      const player: Card[] = [cards[cursor++]];
      const dealer: Card[] = [cards[cursor++]];
      player.push(cards[cursor++]);
      dealer.push(cards[cursor++]);
      let stake = 100;
      if (!isNatural(player) && !isNatural(dealer)) {
        for (;;) {
          const move = basicStrategy(player, dealer[0], { canDouble: player.length === 2, canSplit: false });
          if (move === 'stand') break;
          player.push(cards[cursor++]);
          if (move === 'double') {
            stake *= 2;
            break;
          }
          if (handValue(player).total >= 21) break;
        }
      }
      const played = handValue(player).total > 21 ? { dealer, cursor } : dealerPlay(cards, cursor, dealer);
      cursor = played.cursor;
      wagered += stake;
      returned += settleHand({ cards: player, stake, done: true, fromSplit: false }, played.dealer);
    }
    const edge = 1 - returned / wagered;
    expect(edge).toBeGreaterThan(-0.005);
    expect(edge).toBeLessThan(0.015);
  });
});
