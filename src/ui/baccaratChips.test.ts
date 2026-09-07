import { describe, expect, it } from 'vitest';
import { chipsFor, toneOf } from './baccaratChips';

describe('chipsFor', () => {
  it('splits into largest denominations first and keeps the total', () => {
    expect(chipsFor(6600)).toEqual([5000, 1000, 500, 100]);
    expect(chipsFor(6600).reduce((s, c) => s + c, 0)).toBe(6600);
  });

  it('puts odd remainders in one extra chip', () => {
    expect(chipsFor(250)).toEqual([100, 100, 50]);
    expect(chipsFor(0)).toEqual([]);
  });

  it('maps denominations to colours', () => {
    expect(toneOf(100)).toBe('chip-100');
    expect(toneOf(5000)).toBe('chip-5000');
    expect(toneOf(50)).toBe('chip-100');
  });
});
