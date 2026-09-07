import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import type { BaccaratHand } from '../types';
import { dealTimeline, timingFor } from './baccaratTimeline';

const base: BaccaratHand = { player: [0, 1], banker: [2, 3], playerTotal: 3, bankerTotal: 7, outcome: 'banker' };

describe('dealTimeline', () => {
  it('deals four cards alternating and flips player before banker', () => {
    const tl = dealTimeline(base);
    expect(tl.cards.map((c) => `${c.seat}${c.index}`)).toEqual(['player0', 'banker0', 'player1', 'banker1']);
    const dealAts = tl.cards.map((c) => c.dealAt);
    expect(dealAts).toEqual([0, 1, 2, 3].map((i) => i * CONFIG.BACCARAT_DEAL_STEP_MS));
    for (const c of tl.cards) expect(c.flipAt).toBeGreaterThan(c.dealAt + CONFIG.BACCARAT_SLIDE_MS);
    const p1 = timingFor(tl, 'player', 1)!;
    const b0 = timingFor(tl, 'banker', 0)!;
    expect(p1.flipAt).toBeLessThan(b0.flipAt);
    expect(tl.playerTotalAt).toBeLessThan(tl.bankerTotalAt);
    expect(tl.totalMs).toBeGreaterThan(tl.bankerTotalAt);
  });

  it('adds third cards after the first four are revealed, player first', () => {
    const tl = dealTimeline({ ...base, player: [0, 1, 4], banker: [2, 3, 5] });
    const p2 = timingFor(tl, 'player', 2)!;
    const b2 = timingFor(tl, 'banker', 2)!;
    const b1 = timingFor(tl, 'banker', 1)!;
    expect(p2.dealAt).toBeGreaterThan(b1.flipAt);
    expect(b2.dealAt).toBeGreaterThan(p2.flipAt);
    expect(tl.bankerTotalAt).toBeGreaterThan(b2.flipAt);
    expect(tl.playerTotalAt).toBeGreaterThan(p2.flipAt);
    expect(tl.totalMs).toBeGreaterThan(dealTimeline(base).totalMs);
  });

  it('is monotonic: every card deals after the previous one', () => {
    const tl = dealTimeline({ ...base, player: [0, 1, 4], banker: [2, 3] });
    for (let i = 1; i < tl.cards.length; i++) expect(tl.cards[i].dealAt).toBeGreaterThanOrEqual(tl.cards[i - 1].dealAt);
  });
});
