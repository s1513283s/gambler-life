import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import type { GameState } from '../types';
import { eventDef } from './events';
import { createTitleState, reduce } from './reducer';

/** 事件步：選擇題先選第一個，有結果文字再確認；一般事件直接確認 */
function passEvent(s: GameState): GameState {
  if (s.night?.step !== 'EVENT') return s;
  const choices = eventDef(s.night.event).choices;
  if (choices && s.night.resultText === null) {
    const free = choices.findIndex((c) => (c.effects.cash ?? 0) >= 0);
    s = reduce(s, { type: 'NIGHT_CHOOSE', index: free >= 0 ? free : 0 });
  }
  if (s.night?.step === 'EVENT') s = reduce(s, { type: 'NIGHT_ACK_EVENT' });
  return s;
}

function richRun(cash = 1000000): GameState {
  const s = reduce(createTitleState(), { type: 'NEW_RUN', seed: 5, runId: 'rich', mode: 'free', dailyKey: null, background: 'normal' });
  // 直接給錢並把峰值推過第三層門檻，再讓解鎖跑一次
  const boosted: GameState = { ...s, cash, sanity: 40, stats: { ...s.stats, peakNetWorth: cash } };
  let out = reduce(boosted, { type: 'REPAY', amount: 0 }); // no-op，確認 reducer 不會亂改
  out = reduce({ ...out, cash: out.cash - 1 }, { type: 'BUY_ITEM', item: 'party' }); // 觸發一次 withPeak/解鎖
  out = reduce(out, { type: 'ACK_UNLOCK' });
  return out;
}

function settle(s: GameState): GameState {
  s = reduce({ ...s, rngState: 0 }, { type: 'END_DAY' });
  s = passEvent(s);
  if (s.night?.step === 'LIQUIDATE') s = reduce(s, { type: 'NIGHT_SKIP_LIQUIDATE' });
  return s;
}

describe('purchases', () => {
  it('each item once, cash required, effects applied', () => {
    let s = richRun(400000);
    expect(s.purchases).toContain('party');
    expect(s.sanity).toBe(40 + 25);
    expect(reduce(s, { type: 'BUY_ITEM', item: 'party' })).toBe(s);

    s = reduce(s, { type: 'BUY_ITEM', item: 'house' });
    expect(s.purchases).toContain('house');
    expect(s.expenseGrowth).toBe(CONFIG.HOUSE_EXPENSE_GROWTH);
    const next = reduce(settle(s), { type: 'NEXT_DAY' });
    expect(next.dailyExpense).toBe(Math.round(CONFIG.BASE_EXPENSE * Math.pow(1 + CONFIG.HOUSE_EXPENSE_GROWTH, 1)));

    const poor = { ...s, cash: 10 };
    expect(reduce(poor, { type: 'BUY_ITEM', item: 'watch' })).toBe(poor);
  });

  it('buyout clears the debt and removes the loan shark entirely', () => {
    let s = richRun(300000);
    s = reduce(s, { type: 'BORROW', amount: CONFIG.LOAN_CAP });
    s = reduce(s, { type: 'ACK_UNLOCK' });
    expect(s.debt).toBe(CONFIG.LOAN_CAP);
    s = reduce(s, { type: 'BUY_ITEM', item: 'buyout' });
    expect(s.debt).toBe(0);
    expect(s.loanSharkGone).toBe(true);
    expect(reduce(s, { type: 'BORROW', amount: 5000 })).toBe(s);
    // 沒錢付房租時不再有自動借款，直接死
    const broke = settle({ ...s, cash: 0, stockPositions: [] });
    expect(broke.night?.step === 'SETTLE' && broke.night.deathCause).toBe('RENT');
  });

  it('family gift adds sanity and the label', () => {
    const s = reduce(richRun(200000), { type: 'BUY_ITEM', item: 'family' });
    expect(s.purchases).toContain('family');
    expect(s.sanity).toBe(40 + 25 + CONFIG.FAMILY_SANITY);
  });
});

describe('rich tier', () => {
  it('unlocks at the net-worth peak and is locked before', () => {
    const poor = reduce(createTitleState(), { type: 'NEW_RUN', seed: 5, runId: 'p', mode: 'free', dailyKey: null, background: 'normal' });
    expect(reduce(poor, { type: 'LEND', amount: 100000 })).toBe(poor);
    const s = richRun();
    expect(s.unlockedVenues).toEqual(expect.arrayContaining(['lending', 'managing', 'presale']));
  });

  it('lending compounds nightly, can default, and is collectable', () => {
    let s = reduce(richRun(), { type: 'LEND', amount: 100000 });
    expect(s.lends).toHaveLength(1);
    expect(s.cash).toBe(1000000 - 1 - 30000 - 100000);
    expect(reduce(s, { type: 'LEND', amount: 1000 })).toBe(s);
    let defaults = 0;
    let interest = 0;
    for (let i = 0; i < 30 && s.lends.length > 0 && s.phase === 'ACTION'; i++) {
      s = reduce({ ...s, rngState: 1000 + i }, { type: 'END_DAY' });
      s = passEvent(s);
      if (s.night?.step !== 'SETTLE') throw new Error('no settle');
      defaults += s.night.lendDefaulted;
      interest += s.night.lendInterest;
      s = reduce(s, { type: 'NEXT_DAY' });
    }
    expect(interest + defaults).toBeGreaterThan(0);
    if (s.lends.length > 0) {
      const before = s.cash;
      const principal = s.lends[0].principal;
      expect(principal).toBeGreaterThan(100000);
      s = reduce(s, { type: 'COLLECT_LEND', index: 0 });
      expect(s.cash).toBe(before + principal);
      expect(s.lends).toHaveLength(0);
    }
  });

  it('managing: takes the principal, settles at due day with a 30% share, kills you if you cannot repay', () => {
    let s = reduce(richRun(400000), { type: 'ACCEPT_MANAGE' });
    expect(s.managed).not.toBeNull();
    expect(s.cash).toBe(400000 - 1 - 30000 + CONFIG.MANAGE_PRINCIPAL);
    expect(reduce(s, { type: 'ACCEPT_MANAGE' })).toBe(s);
    // 假裝賺了 100k：把現金加上去，跳到到期日
    const startCash = s.managed?.cashAtStart ?? 0;
    const gainful: GameState = { ...s, cash: startCash + CONFIG.MANAGE_PRINCIPAL + 100000, day: s.managed?.dueDay ?? 0 };
    const settled = settle(gainful);
    if (settled.night?.step !== 'SETTLE') throw new Error('no settle');
    expect(settled.night.managedSettled).toEqual({ profit: 100000, paid: CONFIG.MANAGE_PRINCIPAL + 70000 });
    expect(settled.managed).toBeNull();
    expect(settled.night.outcome).toBe('CONTINUE');

    const busted: GameState = { ...s, cash: 1000, day: s.managed?.dueDay ?? 0 };
    const dead = settle(busted);
    expect(dead.night?.step === 'SETTLE' && dead.night.deathCause).toBe('CLIENT');
  });

  it('presale: equity moves nightly, margin call wipes it, selling returns equity', () => {
    let s = reduce(richRun(), { type: 'BUY_PRESALE', amount: 200000 });
    expect(s.property?.equity).toBe(200000);
    expect(reduce(s, { type: 'BUY_PRESALE', amount: 200000 })).toBe(s);
    s = settle(s);
    if (s.night?.step !== 'SETTLE') throw new Error('no settle');
    expect(Math.abs(s.night.propertyChange)).toBeGreaterThanOrEqual(200000 * CONFIG.PRESALE_MOVE_MIN - 1);
    s = reduce(s, { type: 'NEXT_DAY' });
    if (s.property !== null) {
      const before = s.cash;
      const equity = s.property.equity;
      s = reduce(s, { type: 'SELL_PRESALE' });
      expect(s.cash).toBe(before + equity);
      expect(s.property).toBeNull();
    }

    const doomed: GameState = { ...reduce(richRun(), { type: 'BUY_PRESALE', amount: 200000 }) };
    const low = { ...doomed, property: { ...doomed.property!, equity: Math.floor(200000 * CONFIG.PRESALE_MARGIN_CALL) + 100 } };
    let called = false;
    for (let i = 0; i < 20 && !called; i++) {
      const n = settle({ ...low, rngState: i * 7 });
      if (n.night?.step === 'SETTLE' && n.night.propertyMarginCall) {
        called = true;
        expect(n.property).toBeNull();
      }
    }
    expect(called).toBe(true);
  });
});
