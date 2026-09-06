import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { newShoe } from './cards';
import { hitChance, isPlayable, judge, longmenDelta } from './longmen';
import { makeHand, multiplierOf, niuOf, playerWins } from './niuniu';
import { isTriple, rollDice, sicboPayout } from './sicbo';

const A = 0;
const TWO = 1;
const FIVE = 4;
const SEVEN = 6;
const EIGHT = 7;
const NINE = 8;
const TEN = 9;
const J = 10;
const K = 12;

describe('sicbo', () => {
  it('rolls deterministic dice in 1..6', () => {
    const a = rollDice(9);
    const b = rollDice(9);
    expect(a.dice).toEqual(b.dice);
    for (const d of a.dice) {
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeLessThanOrEqual(6);
    }
  });

  it('pays big/small, sweeps on triples, pays triples', () => {
    expect(sicboPayout({ kind: 'big' }, 100, [4, 5, 6])).toBe(200);
    expect(sicboPayout({ kind: 'small' }, 100, [4, 5, 6])).toBe(0);
    expect(sicboPayout({ kind: 'small' }, 100, [1, 2, 3])).toBe(200);
    expect(sicboPayout({ kind: 'big' }, 100, [4, 4, 4])).toBe(0);
    expect(sicboPayout({ kind: 'small' }, 100, [2, 2, 2])).toBe(0);
    expect(sicboPayout({ kind: 'anyTriple' }, 100, [3, 3, 3])).toBe(100 + 100 * CONFIG.SICBO_ANY_TRIPLE_PAYOUT);
    expect(sicboPayout({ kind: 'triple', face: 3 }, 100, [3, 3, 3])).toBe(100 + 100 * CONFIG.SICBO_TRIPLE_PAYOUT);
    expect(sicboPayout({ kind: 'triple', face: 2 }, 100, [3, 3, 3])).toBe(0);
    expect(isTriple([6, 6, 6])).toBe(true);
  });

  it('long-run edges match config within a point', () => {
    let rng = 1;
    const wagered = 200000;
    let big = 0;
    let any = 0;
    for (let i = 0; i < wagered; i++) {
      const r = rollDice(rng);
      rng = r.rngState;
      big += sicboPayout({ kind: 'big' }, 1, r.dice);
      any += sicboPayout({ kind: 'anyTriple' }, 1, r.dice);
    }
    expect(1 - big / wagered).toBeCloseTo(CONFIG.SICBO_EDGE.big, 1);
    expect(1 - any / wagered).toBeCloseTo(CONFIG.SICBO_EDGE.anyTriple, 1);
  });
});

describe('niuniu', () => {
  it('computes niu values', () => {
    expect(niuOf([TEN, J, K, FIVE, FIVE])).toBe(10); // 10+10+10 湊十，5+5=10 → 牛牛
    expect(niuOf([TEN, J, K, FIVE, TWO])).toBe(7);
    expect(niuOf([A, TWO, SEVEN, EIGHT, NINE])).toBe(7); // 1+2+7=10, 8+9=17 → 牛7
    expect(niuOf([A, A, TWO, TWO, FIVE])).toBe(0); // 無牛
    expect(multiplierOf(10)).toBe(3);
    expect(multiplierOf(8)).toBe(2);
    expect(multiplierOf(3)).toBe(1);
  });

  it('same niu compares the high card; identical hands go to the banker', () => {
    const p = makeHand([TEN, J, K, FIVE, TWO]); // 牛7，最大 K♠
    const b = makeHand([TEN, TEN, TEN, FIVE, TWO]); // 牛7，最大 10
    expect(playerWins(p, b)).toBe(true);
    expect(playerWins(b, p)).toBe(false);
    expect(playerWins(p, p)).toBe(false);
    expect(playerWins(makeHand([TEN, J, K, FIVE, FIVE]), b)).toBe(true);
  });

  it('house edge from ties is a few percent', () => {
    let rng = 3;
    let shoe = newShoe(CONFIG.NIUNIU_DECKS, rng);
    rng = shoe.rngState;
    let cursor = 0;
    let net = 0;
    const n = 60000;
    for (let i = 0; i < n; i++) {
      if (shoe.cards.length - cursor < 10) {
        shoe = newShoe(CONFIG.NIUNIU_DECKS, rng);
        rng = shoe.rngState;
        cursor = 0;
      }
      const p = makeHand(shoe.cards.slice(cursor, cursor + 5));
      const b = makeHand(shoe.cards.slice(cursor + 5, cursor + 10));
      cursor += 10;
      const win = playerWins(p, b);
      net += win ? multiplierOf(p.niu) : -multiplierOf(b.niu);
    }
    const edge = -net / n;
    expect(edge).toBeGreaterThan(0.005);
    expect(edge).toBeLessThan(0.08);
  });
});

describe('longmen', () => {
  it('needs room between posts', () => {
    expect(isPlayable([TWO, FIVE])).toBe(true);
    expect(isPlayable([TWO, TWO])).toBe(false);
    expect(isPlayable([FIVE, SEVEN - 1])).toBe(false);
  });

  it('judges hit, post, miss and pays accordingly', () => {
    expect(judge([TWO, NINE], FIVE)).toBe('hit');
    expect(judge([TWO, NINE], NINE + 13)).toBe('post');
    expect(judge([TWO, NINE], K)).toBe('miss');
    expect(longmenDelta('hit', 100, 2)).toBe(200);
    expect(longmenDelta('post', 100, 2)).toBe(-100);
    expect(longmenDelta('miss', 100, 2)).toBe(0);
    expect(hitChance([A, K])).toBeCloseTo(44 / 52);
  });
});
