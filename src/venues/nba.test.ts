import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import type { NbaGame } from '../data/schema';
import type { NbaBet, NbaBetLeg } from '../types';
import { buildDayOrder, combinedOdds, nbaEdgeCost, payoutFor, resolveLeg, settleLeg, validateLegs } from './nba';

const game: NbaGame = {
  id: 'g1',
  home: '湖人',
  away: '勇士',
  ml: { home: 1.85, away: 2.05 },
  spread: { line: -2.5, home: 1.91, away: 1.91 },
  total: { line: 228.5, over: 1.91, under: 1.91 },
  score: { home: 112, away: 108 },
};

const leg = (market: NbaBetLeg['market'], side: NbaBetLeg['side']): NbaBetLeg => {
  const r = resolveLeg([game], { gameId: 'g1', market, side });
  if (r === null) throw new Error('bad leg');
  return r;
};

describe('nba', () => {
  it('resolves legs from the schedule and rejects bad picks', () => {
    expect(leg('ml', 'home')).toMatchObject({ odds: 1.85, line: 0, home: '湖人', away: '勇士' });
    expect(leg('spread', 'away')).toMatchObject({ odds: 1.91, line: -2.5 });
    expect(leg('total', 'under')).toMatchObject({ odds: 1.91, line: 228.5 });
    expect(resolveLeg([game], { gameId: 'g1', market: 'ml', side: 'over' })).toBeNull();
    expect(resolveLeg([game], { gameId: 'nope', market: 'ml', side: 'home' })).toBeNull();
  });

  it('settles ml, spread, total, and pushes', () => {
    const score = game.score; // 112-108，總分 220
    expect(settleLeg(leg('ml', 'home'), score)).toBe('win');
    expect(settleLeg(leg('ml', 'away'), score)).toBe('loss');
    expect(settleLeg(leg('spread', 'home'), score)).toBe('win'); // 112 - 2.5 > 108
    expect(settleLeg(leg('spread', 'away'), score)).toBe('loss');
    expect(settleLeg(leg('total', 'over'), score)).toBe('loss');
    expect(settleLeg(leg('total', 'under'), score)).toBe('win');
    const pushSpread = { ...leg('spread', 'home'), line: -4 };
    expect(settleLeg(pushSpread, score)).toBe('push');
    const pushTotal = { ...leg('total', 'over'), line: 220 };
    expect(settleLeg(pushTotal, score)).toBe('push');
  });

  it('pays singles, parlays, treats push legs as 1.0, refunds all-push', () => {
    const single: NbaBet = { id: 'b', stake: 1000, legs: [leg('ml', 'home')] };
    expect(payoutFor(single, ['win'])).toBe(1850);
    expect(payoutFor(single, ['loss'])).toBe(0);
    expect(payoutFor(single, ['push'])).toBe(1000);

    const parlay: NbaBet = { id: 'p', stake: 1000, legs: [leg('ml', 'home'), leg('spread', 'home'), leg('total', 'under')] };
    expect(combinedOdds(parlay.legs)).toBeCloseTo(1.85 * 1.91 * 1.91);
    expect(payoutFor(parlay, ['win', 'win', 'win'])).toBe(Math.floor(1000 * 1.85 * 1.91 * 1.91));
    expect(payoutFor(parlay, ['win', 'loss', 'win'])).toBe(0);
    expect(payoutFor(parlay, ['win', 'push', 'win'])).toBe(Math.floor(1000 * 1.85 * 1.91));
    expect(payoutFor(parlay, ['push', 'push', 'push'])).toBe(1000);
  });

  it('ev cost compounds the vig per leg', () => {
    expect(nbaEdgeCost(1000, 1)).toBeCloseTo(45);
    expect(nbaEdgeCost(1000, 6)).toBeCloseTo(1000 * (1 - 0.955 ** 6));
  });

  it('validates leg count and distinct games', () => {
    const pick = (gameId: string) => ({ gameId, market: 'ml' as const, side: 'home' as const });
    expect(validateLegs([])).toBe(false);
    expect(validateLegs([pick('a')])).toBe(true);
    expect(validateLegs([pick('a'), pick('a')])).toBe(false);
    expect(validateLegs(Array.from({ length: CONFIG.PARLAY_MAX_LEGS + 1 }, (_, i) => pick(`g${i}`)))).toBe(false);
  });

  it('builds a shuffled day order with rest days, deterministic per seed', () => {
    const a = buildDayOrder(100, 5);
    const b = buildDayOrder(100, 5);
    expect(a.order).toEqual(b.order);
    const gameDays = a.order.filter((d) => d >= 0);
    expect([...gameDays].sort((x, y) => x - y)).toEqual(Array.from({ length: 100 }, (_, i) => i));
    const rest = a.order.filter((d) => d === -1).length;
    expect(rest).toBeGreaterThan(3);
    expect(rest).toBeLessThan(40);
    expect(buildDayOrder(100, 6).order).not.toEqual(a.order);
  });
});
