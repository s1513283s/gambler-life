import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { baccaratValue, dealHand, handTotal, payoutFor } from './baccarat';
import { minBetFor } from './betting';
import { buildShoe, cardLabel, newShoe, shuffle } from './cards';

// 花色 0 的牌：rank 索引就是牌號。A=0, 2=1, ..., 9=8, 10=9, J=10, Q=11, K=12
const A = 0;
const TWO = 1;
const THREE = 2;
const FOUR = 3;
const EIGHT = 7;
const NINE = 8;
const K = 12;

describe('cards', () => {
  it('builds 8 decks and shuffles deterministically', () => {
    const shoe = buildShoe(8);
    expect(shoe).toHaveLength(416);
    const a = shuffle(shoe, 7);
    const b = shuffle(shoe, 7);
    expect(a.cards).toEqual(b.cards);
    expect(a.rngState).toBe(b.rngState);
    expect([...a.cards].sort((x, y) => x - y)).toEqual([...shoe].sort((x, y) => x - y));
    expect(newShoe(1, 3).cards).toHaveLength(52);
  });

  it('labels cards', () => {
    expect(cardLabel(0)).toBe('A♠');
    expect(cardLabel(13 + 12)).toBe('K♥');
  });
});

describe('baccarat rules', () => {
  it('values cards and totals mod 10', () => {
    expect(baccaratValue(A)).toBe(1);
    expect(baccaratValue(NINE)).toBe(9);
    expect(baccaratValue(K)).toBe(0);
    expect(handTotal([NINE, EIGHT])).toBe(7);
  });

  it('natural 9 stands, player wins', () => {
    const { hand, cursor } = dealHand([NINE, TWO, K, THREE], 0);
    expect(hand.playerTotal).toBe(9);
    expect(hand.bankerTotal).toBe(5);
    expect(hand.player).toHaveLength(2);
    expect(hand.outcome).toBe('player');
    expect(cursor).toBe(4);
  });

  it('player draws on 5; banker 3 stands against a player third card of 8', () => {
    const { hand } = dealHand([TWO, A, THREE, TWO, EIGHT], 0);
    expect(hand.player).toHaveLength(3);
    expect(hand.playerTotal).toBe(3);
    expect(hand.banker).toHaveLength(2);
    expect(hand.bankerTotal).toBe(3);
    expect(hand.outcome).toBe('tie');
  });

  it('player 6 stands; banker 5 draws', () => {
    const { hand, cursor } = dealHand([THREE, TWO, THREE, THREE, FOUR], 0);
    expect(hand.player).toHaveLength(2);
    expect(hand.banker).toHaveLength(3);
    expect(hand.bankerTotal).toBe(9);
    expect(hand.outcome).toBe('banker');
    expect(cursor).toBe(5);
  });

  it('pays banker minus commission, player even, tie 8:1, and pushes side bets on tie', () => {
    expect(payoutFor('banker', 1000, 'banker')).toBe(1950);
    expect(payoutFor('player', 1000, 'player')).toBe(2000);
    expect(payoutFor('tie', 100, 'tie')).toBe(900);
    expect(payoutFor('banker', 1000, 'tie')).toBe(1000);
    expect(payoutFor('player', 1000, 'banker')).toBe(0);
    expect(payoutFor('tie', 100, 'player')).toBe(0);
  });

  it('long-run banker edge is about 1% with the shoe rules', () => {
    let rng = 99;
    let wagered = 0;
    let returned = 0;
    let shoe = newShoe(8, rng);
    rng = shoe.rngState;
    let cursor = 0;
    for (let i = 0; i < 200000; i++) {
      if (shoe.cards.length - cursor < CONFIG.BACCARAT_CUT_CARD) {
        shoe = newShoe(8, rng);
        rng = shoe.rngState;
        cursor = 0;
      }
      const dealt = dealHand(shoe.cards, cursor);
      cursor = dealt.cursor;
      wagered += 100;
      returned += payoutFor('banker', 100, dealt.hand.outcome);
    }
    const edge = 1 - returned / wagered;
    expect(edge).toBeGreaterThan(0.005);
    expect(edge).toBeLessThan(0.018);
  });

  it('min bet is 25% of cash when tilting', () => {
    expect(minBetFor('baccarat', 10000, false)).toBe(CONFIG.BACCARAT_MIN_BET);
    expect(minBetFor('baccarat', 10000, true)).toBe(2500);
    expect(minBetFor('baccarat', 50, true)).toBe(50);
  });
});
