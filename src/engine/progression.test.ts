import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import type { GameAction, GameState } from '../types';
import { createTitleState, reduce } from './reducer';

function newRun(seed = 1, background: GameState['background'] = 'normal', mode: GameState['mode'] = 'free', dailyKey: string | null = null): GameState {
  return reduce(createTitleState(), { type: 'NEW_RUN', seed, runId: `t-${seed}`, mode, dailyKey, background });
}

function playDay(s: GameState, action: GameAction): GameState {
  s = reduce(s, action);
  s = reduce(s, { type: 'END_DAY' });
  if (s.night?.step === 'EVENT') s = reduce(s, { type: 'NIGHT_ACK_EVENT' });
  if (s.night?.step === 'LIQUIDATE') s = reduce(s, { type: 'NIGHT_SKIP_LIQUIDATE' });
  return reduce(s, { type: 'NEXT_DAY' });
}

function settle(s: GameState): GameState {
  s = reduce({ ...s, rngState: 0 }, { type: 'END_DAY' });
  if (s.night?.step === 'EVENT') s = reduce(s, { type: 'NIGHT_ACK_EVENT' });
  if (s.night?.step === 'LIQUIDATE') s = reduce(s, { type: 'NIGHT_SKIP_LIQUIDATE' });
  return s;
}

describe('progression', () => {
  it('starts with tier 0 venues only and rejects locked ones', () => {
    const s = newRun();
    expect(s.unlockedVenues).not.toContain('baccarat');
    expect(s.unlockedVenues).toContain('scratch');
    expect(reduce(s, { type: 'ENTER_VENUE', venue: 'baccarat' })).toBe(s);
    expect(reduce(s, { type: 'ENTER_VENUE', venue: 'scratch' }).phase).toBe('VENUE');
  });

  it('first loan unlocks tier 1 with a dialogue; enough borrowing unlocks tier 2', () => {
    let s = reduce(newRun(), { type: 'BORROW', amount: CONFIG.LOAN_UNIT });
    expect(s.unlockedVenues).toContain('baccarat');
    expect(s.unlockedVenues).toContain('blackjack');
    expect(s.unlockedVenues).not.toContain('sicbo');
    expect(s.pendingUnlock).toEqual(expect.arrayContaining(['baccarat', 'blackjack']));
    s = reduce(s, { type: 'ACK_UNLOCK' });
    expect(s.pendingUnlock).toBeNull();
    s = reduce(s, { type: 'BORROW', amount: CONFIG.UNLOCK_TIER2_BORROWED });
    expect(s.stats.totalBorrowed).toBeGreaterThanOrEqual(CONFIG.UNLOCK_TIER2_BORROWED);
    expect(s.unlockedVenues).toEqual(expect.arrayContaining(['sicbo', 'niuniu', 'longmen']));
  });

  it('the broke background starts already knowing the loan shark, silently', () => {
    const s = newRun(1, 'broke');
    expect(s.debt).toBe(10000);
    expect(s.cash).toBe(5000);
    expect(s.unlockedVenues).toContain('baccarat');
    expect(s.pendingUnlock).toBeNull();
  });

  it('backgrounds change wage, sanity cost and expense', () => {
    const eng = newRun(1, 'engineer');
    const worked = reduce(eng, { type: 'WORK' });
    expect(worked.cash).toBe(eng.cash + 1500);
    expect(worked.sanity).toBe(CONFIG.SANITY_START - 25);
    const rich = newRun(1, 'rich');
    expect(rich.dailyExpense).toBe(CONFIG.BASE_EXPENSE * 2);
  });

  it('daily mode carries its key and the same seed reproduces the run', () => {
    const a = newRun(99, 'normal', 'daily', '2026-09-07');
    const b = newRun(99, 'normal', 'daily', '2026-09-07');
    expect(a.mode).toBe('daily');
    expect(a.dailyKey).toBe('2026-09-07');
    const pa = playDay(a, { type: 'WORK' });
    const pb = playDay(b, { type: 'WORK' });
    expect(pa.night).toEqual(pb.night);
    expect(pa.rngState).toBe(pb.rngState);
  });
});

describe('loan shark escalation', () => {
  it('sends a thug above the thug threshold: blocks work tomorrow', () => {
    let s = reduce(newRun(), { type: 'BORROW', amount: CONFIG.DEBT_THUG_THRESHOLD + 1000 });
    s = reduce(s, { type: 'ACK_UNLOCK' });
    s = settle(s);
    expect(s.night?.step).toBe('SETTLE');
    if (s.night?.step !== 'SETTLE') return;
    expect(s.night.thug).toBe(true);
    expect(s.night.harassed).toBe(true);
    s = reduce(s, { type: 'NEXT_DAY' });
    expect(s.day).toBe(2);
    expect(reduce(s, { type: 'WORK' })).toBe(s);
  });

  it('counts down while maxed out and takes you away at the deadline', () => {
    let s = reduce(newRun(), { type: 'BORROW', amount: CONFIG.LOAN_CAP });
    s = reduce(s, { type: 'ACK_UNLOCK' });
    for (let i = 0; i < CONFIG.DEBT_DEADLINE_DAYS + 2; i++) {
      s = settle({ ...s, cash: 999999, sanity: 100 }); // 排除房租與精神死
      if (s.night?.step !== 'SETTLE') throw new Error('no settle');
      if (s.night.outcome === 'DEATH') {
        expect(s.night.deathCause).toBe('LOAN_SHARK');
        expect(s.night.deadlineDaysLeft).toBe(0);
        s = reduce(s, { type: 'NEXT_DAY' });
        expect(s.phase).toBe('DEATH');
        return;
      }
      s = reduce(s, { type: 'NEXT_DAY' });
    }
    throw new Error('never taken away');
  });

  it('repaying below the cap resets the countdown', () => {
    let s = reduce(newRun(), { type: 'BORROW', amount: CONFIG.LOAN_CAP });
    s = reduce(s, { type: 'ACK_UNLOCK' });
    s = settle({ ...s, cash: 999999, sanity: 100 });
    s = reduce(s, { type: 'NEXT_DAY' });
    expect(s.daysMaxedOut).toBe(1);
    s = reduce(s, { type: 'REPAY', amount: 5000 });
    s = settle({ ...s, sanity: 100 });
    expect(s.daysMaxedOut).toBe(0);
  });
});

describe('underground venues', () => {
  function unlockedRun(seed = 21): GameState {
    let s = reduce(newRun(seed), { type: 'BORROW', amount: CONFIG.UNLOCK_TIER2_BORROWED });
    s = reduce(s, { type: 'ACK_UNLOCK' });
    return { ...s, cash: 30000 };
  }

  it('sicbo: bet, roll, resolve', () => {
    let s = reduce(unlockedRun(), { type: 'ENTER_VENUE', venue: 'sicbo' });
    expect(s.phase).toBe('VENUE');
    s = reduce(s, { type: 'SICBO_BET', bet: { kind: 'big' }, stake: 500 });
    expect(s.cash).toBe(29500);
    expect(s.venue?.kind === 'sicbo' && s.venue.pending?.dice.length).toBe(3);
    expect(reduce(s, { type: 'LEAVE_VENUE' })).toBe(s);
    s = reduce(s, { type: 'SICBO_RESOLVE' });
    expect(s.venue?.kind === 'sicbo' && s.venue.handsPlayed).toBe(1);
    expect(s.stats.byVenue.sicbo.wagered).toBe(500);
    expect(reduce(s, { type: 'SICBO_BET', bet: { kind: 'triple', face: 9 }, stake: 500 })).toBe(s);
  });

  it('niuniu: stake capped at a third of cash, loss can cost the multiplier', () => {
    let s = reduce(unlockedRun(), { type: 'ENTER_VENUE', venue: 'niuniu' });
    expect(reduce(s, { type: 'NIUNIU_BET', stake: 20000 })).toBe(s);
    s = reduce(s, { type: 'NIUNIU_BET', stake: 3000 });
    expect(s.cash).toBe(27000);
    const before = s;
    s = reduce(s, { type: 'NIUNIU_RESOLVE' });
    const r = s.venue?.kind === 'niuniu' ? s.venue.lastResult : null;
    expect(r).not.toBeNull();
    if (r === null) return;
    const net = r.playerWins ? 3000 * r.multiplier : -3000 * r.multiplier;
    expect(s.cash).toBe(before.cash + 3000 + net);
    expect(s.cash).toBeGreaterThanOrEqual(0);
  });

  it('longmen: deals playable posts, bets at most half the cash, resolves', () => {
    let s = reduce(unlockedRun(), { type: 'ENTER_VENUE', venue: 'longmen' });
    s = reduce(s, { type: 'LONGMEN_DEAL' });
    const round = s.venue?.kind === 'longmen' ? s.venue.round : null;
    expect(round).not.toBeNull();
    if (round === null) return;
    expect(round.stake).toBeNull();
    expect(reduce(s, { type: 'LONGMEN_BET', stake: 20000 })).toBe(s);
    expect(reduce(s, { type: 'LONGMEN_DEAL' })).toBe(s);
    s = reduce(s, { type: 'LONGMEN_BET', stake: 1000 });
    const after = s.venue?.kind === 'longmen' ? s.venue.round : null;
    expect(after?.third).not.toBeNull();
    expect(after?.outcome).not.toBeNull();
    expect(reduce(s, { type: 'LEAVE_VENUE' })).toBe(s);
    const cashBefore = s.cash;
    s = reduce(s, { type: 'LONGMEN_RESOLVE' });
    expect(s.venue?.kind === 'longmen' && s.venue.round).toBeNull();
    if (after?.outcome === 'hit') expect(s.cash).toBe(cashBefore + 2000);
    if (after?.outcome === 'miss') expect(s.cash).toBe(cashBefore);
    if (after?.outcome === 'post') expect(s.cash).toBe(cashBefore - 1000);
  });
});
