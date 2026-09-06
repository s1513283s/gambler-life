import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import type { Candle, CryptoSegment, NbaGame, NbaGameDay, StockSegment } from '../data/schema';
import { VENUE_IDS, type GameAction, type GameState } from '../types';
import { buildDeathCard } from './death';
import { EVENTS, applyEffect, eventDef, pickEvent } from './events';
import { createTitleState, reduce } from './reducer';

type Policy = (state: GameState) => 'WORK' | 'REST';

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

function newRun(seed = 1): GameState {
  return reduce(createTitleState(), { type: 'NEW_RUN', seed, runId: 'test', mode: 'free', dailyKey: null, background: 'normal' });
}

/** 走完一整天：START_DAY -> 主行動 -> END_DAY -> (事件確認) -> NEXT_DAY */
function playDay(s: GameState, action: GameAction): GameState {
  s = reduce(s, action);
  s = reduce(s, { type: 'END_DAY' });
  s = passEvent(s);
  return reduce(s, { type: 'NEXT_DAY' });
}

function playUntilDeath(policy: Policy, seed = 1, maxDays = 500): GameState {
  let s = newRun(seed);
  while (s.phase !== 'DEATH' && s.day <= maxDays) s = playDay(s, { type: policy(s) });
  return s;
}

describe('phase guard', () => {
  it('ignores actions outside their phase', () => {
    const title = createTitleState();
    const types = ['WORK', 'REST', 'END_DAY', 'NIGHT_ACK_EVENT', 'NEXT_DAY', 'RETIRE'] as const;
    for (const type of types) expect(reduce(title, { type })).toBe(title);
    expect(reduce(title, { type: 'BORROW', amount: 5000 })).toBe(title);
  });

  it('allows only one main action per day', () => {
    let s = newRun();
    s = reduce(s, { type: 'WORK' });
    const cashAfterWork = s.cash;
    s = reduce(s, { type: 'WORK' });
    expect(s.cash).toBe(cashAfterWork);
    s = reduce(s, { type: 'REST' });
    expect(s.todayAction).toBe('WORK');
  });

  it('NEXT_DAY is ignored while the event modal is open', () => {
    let s = newRun();
    s = { ...s, phase: 'NIGHT', night: { step: 'EVENT', event: 'sick', resultText: null } };
    expect(reduce(s, { type: 'NEXT_DAY' })).toBe(s);
    expect(reduce(s, { type: 'NIGHT_ACK_EVENT' }).night?.step).toBe('SETTLE');
  });
});

describe('economy', () => {
  it('starts with spec values and grows expense 2% per day', () => {
    const s = newRun();
    expect(s.cash).toBe(CONFIG.START_CASH);
    expect(s.sanity).toBe(CONFIG.SANITY_START);
    expect(s.dailyExpense).toBe(CONFIG.BASE_EXPENSE);
    expect(s.obsession.done).toBe(false);

    const d = playDay({ ...s, rngState: 0 }, { type: 'END_DAY' });
    expect(d.day).toBe(2);
    expect(d.dailyExpense).toBe(Math.round(CONFIG.BASE_EXPENSE * (1 + CONFIG.EXPENSE_GROWTH)));
  });

  it('working every day dies of sanity within a week', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const s = playUntilDeath(() => 'WORK', seed);
      expect(s.stats.causeOfDeath).toBe('SANITY');
      expect(s.day).toBeLessThanOrEqual(6);
    }
  });

  it('work-work-rest cycle lands near the 20-day target', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const s = playUntilDeath((st) => (st.day % 3 === 0 ? 'REST' : 'WORK'), seed);
      expect(s.day).toBeGreaterThanOrEqual(14);
      expect(s.day).toBeLessThanOrEqual(32);
      expect(s.stats.loansTaken).toBeGreaterThan(0);
    }
  });

  it('auto-borrows the shortfall and never lets cash go negative outside NIGHT', () => {
    let s = newRun();
    let sawLoan = false;
    while (s.phase !== 'DEATH') {
      s = reduce(s, { type: s.day % 3 === 0 ? 'REST' : 'WORK' });
      s = reduce(s, { type: 'END_DAY' });
      s = passEvent(s);
      if (s.night?.step === 'SETTLE' && s.night.autoLoan > 0) {
        sawLoan = true;
        expect(s.cash).toBe(0);
      }
      s = reduce(s, { type: 'NEXT_DAY' });
      if (s.phase !== 'DEATH') expect(s.cash).toBeGreaterThanOrEqual(0);
    }
    expect(sawLoan).toBe(true);
  });

  it('records one DayLog per day', () => {
    const s = playUntilDeath(() => 'WORK');
    expect(s.history).toHaveLength(s.day);
    expect(s.history[0]).toMatchObject({ day: 1, action: 'WORK', expense: 1000 });
  });
});

describe('loan shark', () => {
  it('borrows in units up to the cap and counts each loan', () => {
    let s = newRun();
    s = reduce(s, { type: 'BORROW', amount: CONFIG.LOAN_UNIT });
    expect(s.cash).toBe(CONFIG.START_CASH + CONFIG.LOAN_UNIT);
    expect(s.debt).toBe(CONFIG.LOAN_UNIT);
    expect(s.stats.loansTaken).toBe(1);

    s = reduce(s, { type: 'BORROW', amount: 999999 });
    expect(s.debt).toBe(CONFIG.LOAN_CAP);
    const capped = reduce(s, { type: 'BORROW', amount: 1 });
    expect(capped).toBe(s);
  });

  it('repays at most min(cash, debt) and charges interest on the remainder', () => {
    let s = newRun();
    s = reduce(s, { type: 'BORROW', amount: 10000 });
    s = reduce(s, { type: 'REPAY', amount: 4000 });
    expect(s.debt).toBe(6000);
    expect(s.cash).toBe(CONFIG.START_CASH + 6000);
    expect(reduce(s, { type: 'REPAY', amount: 0 })).toBe(s);

    s = reduce({ ...s, rngState: 0 }, { type: 'END_DAY' });
    s = passEvent(s);
    expect(s.night?.step).toBe('SETTLE');
    expect(s.debt).toBe(6000 + Math.round(6000 * CONFIG.LOAN_DAILY_RATE));
  });

  it('does not let repaying dip below zero cash', () => {
    let s = newRun();
    s = reduce(s, { type: 'BORROW', amount: CONFIG.LOAN_CAP });
    s = { ...s, cash: 1000 };
    s = reduce(s, { type: 'REPAY', amount: CONFIG.LOAN_CAP });
    expect(s.cash).toBe(0);
    expect(s.debt).toBe(CONFIG.LOAN_CAP - 1000);
  });
});

describe('events', () => {
  it('random weights sum to 100 and the pick distribution matches within 2 points', () => {
    const random = EVENTS.filter((e) => e.weight > 0);
    expect(random.reduce((sum, e) => sum + e.weight, 0)).toBe(100);
    const base = { ...newRun(), stats: { ...newRun().stats, daysGambled: 5 } };
    const counts = new Map<string, number>();
    let s = base;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const pick = pickEvent(s, true);
      s = { ...s, rngState: pick.rngState };
      counts.set(pick.event.id, (counts.get(pick.event.id) ?? 0) + 1);
    }
    for (const def of random) {
      const pct = ((counts.get(def.id) ?? 0) / n) * 100;
      expect(Math.abs(pct - def.weight), def.id).toBeLessThan(2);
    }
  });

  it('overtime pay downgrades to nothing on a day without work', () => {
    let s = newRun();
    let sawOvertime = false;
    for (let i = 0; i < 5000; i++) {
      const worked = pickEvent(s, true);
      const idle = pickEvent(s, false);
      if (worked.event.id === 'overtime_pay') {
        sawOvertime = true;
        expect(idle.event.id).toBe('nothing');
      }
      s = { ...s, rngState: worked.rngState };
    }
    expect(sawOvertime).toBe(true);
  });

  it('applies cash, sanity, multiplier and flags', () => {
    const s = newRun();
    expect(applyEffect(s, eventDef('bike_broke')).state.cash).toBe(CONFIG.START_CASH - 2000);
    expect(applyEffect(s, eventDef('sick')).state).toMatchObject({ sanity: 70, workBlockedUntilDay: 2 });
    expect(applyEffect(s, eventDef('insider_tip')).state.insiderTipDay).toBe(2);
    expect(applyEffect(s, eventDef('rent_hike')).state.expenseMultiplier).toBeCloseTo(1.1);
    expect(applyEffect(s, eventDef('nothing')).state).toEqual(s);
  });

  it('sick blocks work tomorrow only, rent hike shows up in tomorrow expense', () => {
    let s = newRun();
    s = applyEffect(s, eventDef('sick')).state;
    s = applyEffect(s, eventDef('rent_hike')).state;
    s = { ...s, phase: 'NIGHT', night: { step: 'EVENT', event: 'sick', resultText: null } };
    s = reduce(s, { type: 'NIGHT_ACK_EVENT' });
    s = reduce(s, { type: 'NEXT_DAY' });
    expect(s.day).toBe(2);
    expect(s.dailyExpense).toBe(Math.round(CONFIG.BASE_EXPENSE * (1 + CONFIG.EXPENSE_GROWTH) * 1.1));

    const blocked = reduce(s, { type: 'WORK' });
    expect(blocked).toBe(s);
    expect(reduce(s, { type: 'REST' }).todayAction).toBe('REST');

    s = playDay({ ...s, rngState: 0 }, { type: 'REST' });
    expect(reduce(s, { type: 'WORK' }).todayAction).toBe('WORK');
  });

  it('a cash event can push cash negative before settlement, then the loan covers it', () => {
    let s = newRun();
    s = { ...s, cash: 500 };
    s = applyEffect(s, eventDef('bike_broke')).state;
    expect(s.cash).toBe(-1500);
    s = { ...s, phase: 'NIGHT', night: { step: 'EVENT', event: 'bike_broke', resultText: null } };
    s = reduce(s, { type: 'NIGHT_ACK_EVENT' });
    expect(s.night).toMatchObject({ step: 'SETTLE', autoLoan: 2500, outcome: 'CONTINUE' });
    expect(s.cash).toBe(0);
    expect(s.debt).toBe(2500);
  });
});

describe('baccarat venue', () => {
  function enter(seed = 7): GameState {
    const s = { ...newRun(seed), unlockedVenues: [...VENUE_IDS] };
    return reduce(s, { type: 'ENTER_VENUE', venue: 'baccarat' });
  }

  it('entering uses the main action and opens a shuffled 8-deck shoe', () => {
    const s = enter();
    expect(s.phase).toBe('VENUE');
    expect(s.todayAction).toBe('GAMBLE');
    expect(s.actionUsedToday).toBe(true);
    expect(s.venue?.kind).toBe('baccarat');
    expect(s.venue?.kind === 'baccarat' && s.venue.shoe.length).toBe(416);
    expect(s.stats.daysGambled).toBe(1);
    expect(s.stats.byVenue.baccarat.sessions).toBe(1);
    expect(reduce(s, { type: 'WORK' })).toBe(s);
    expect(reduce(s, { type: 'END_DAY' })).toBe(s);
  });

  it('bet deducts stake and deals; resolve pays out and updates stats', () => {
    let s = enter();
    s = reduce(s, { type: 'BACCARAT_BET', side: 'banker', stake: 1000 });
    expect(s.cash).toBe(CONFIG.START_CASH - 1000);
    expect(s.venue?.kind === 'baccarat' && s.venue.pending?.stake).toBe(1000);
    expect(s.stats.totalWagered).toBe(1000);
    expect(s.stats.totalEvGiven).toBeCloseTo(1000 * CONFIG.BACCARAT_EDGE.banker);

    // 動畫中不能再下注、不能離開
    expect(reduce(s, { type: 'BACCARAT_BET', side: 'banker', stake: 1000 })).toBe(s);
    expect(reduce(s, { type: 'LEAVE_VENUE' })).toBe(s);

    const before = s;
    s = reduce(s, { type: 'BACCARAT_RESOLVE' });
    expect(s.venue?.kind === 'baccarat' && s.venue.pending).toBeNull();
    expect(s.venue?.kind === 'baccarat' && s.venue.handsPlayed).toBe(1);
    const result = s.venue?.kind === 'baccarat' ? s.venue.lastResult : null;
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(s.cash).toBe(before.cash + result.payout);
    const net = result.payout - 1000;
    expect(s.venueNetToday).toBe(net);
    expect(s.stats.byVenue.baccarat.net).toBe(net);
    if (net > 0) expect(s.sanity).toBe(CONFIG.SANITY_START + CONFIG.GAMBLE_WIN_SANITY);
    if (net < 0) expect(s.sanity).toBe(CONFIG.SANITY_START - CONFIG.GAMBLE_LOSS_SANITY);
    expect(reduce(s, { type: 'BACCARAT_RESOLVE' })).toBe(s);
  });

  it('rejects stakes below the minimum, above cash, or when broke', () => {
    const s = enter();
    expect(reduce(s, { type: 'BACCARAT_BET', side: 'player', stake: 50 })).toBe(s);
    expect(reduce(s, { type: 'BACCARAT_BET', side: 'player', stake: s.cash + 1 })).toBe(s);
    const broke = { ...s, cash: 40 };
    expect(reduce(broke, { type: 'BACCARAT_BET', side: 'player', stake: 40 })).toBe(broke);
  });

  it('tilt forces 25% minimum and 3 hands before leaving, unless broke', () => {
    let s = { ...enter(), tilt: true };
    expect(reduce(s, { type: 'BACCARAT_BET', side: 'banker', stake: 1000 })).toBe(s);
    expect(reduce(s, { type: 'LEAVE_VENUE' })).toBe(s);
    for (let i = 0; i < 3; i++) {
      s = reduce(s, { type: 'BACCARAT_BET', side: 'banker', stake: Math.ceil(s.cash * 0.25) });
      s = reduce(s, { type: 'BACCARAT_RESOLVE' });
    }
    expect(s.venue?.kind === 'baccarat' && s.venue.handsPlayed).toBe(3);
    s = reduce(s, { type: 'LEAVE_VENUE' });
    expect(s.phase).toBe('ACTION');
    expect(s.venue).toBeNull();

    const brokeTilt = { ...enter(), tilt: true, cash: 0 };
    expect(reduce(brokeTilt, { type: 'LEAVE_VENUE' }).phase).toBe('ACTION');
  });

  it('reshuffles when the shoe runs past the cut card', () => {
    let s = enter();
    let reshuffles = 0;
    for (let i = 0; i < 120; i++) {
      const cursorBefore = s.venue?.kind === 'baccarat' ? s.venue.cursor : 0;
      s = reduce(s, { type: 'BACCARAT_BET', side: 'player', stake: 100 });
      const cursorAfter = s.venue?.kind === 'baccarat' ? s.venue.cursor : 0;
      if (cursorAfter < cursorBefore) reshuffles += 1;
      s = reduce(s, { type: 'BACCARAT_RESOLVE' });
      if (s.cash < 100) break;
    }
    expect(reshuffles).toBeGreaterThanOrEqual(1);
  });

  it('venue net flows into the DayLog', () => {
    let s = enter();
    s = reduce(s, { type: 'BACCARAT_BET', side: 'banker', stake: 2000 });
    s = reduce(s, { type: 'BACCARAT_RESOLVE' });
    const net = s.venueNetToday;
    s = reduce(s, { type: 'LEAVE_VENUE' });
    s = reduce(s, { type: 'END_DAY' });
    s = passEvent(s);
    expect(s.history[0]).toMatchObject({ action: 'GAMBLE', venueNet: net });
    s = reduce(s, { type: 'NEXT_DAY' });
    expect(s.venueNetToday).toBe(0);
  });
});

describe('blackjack venue', () => {
  function enterBj(seed = 11): GameState {
    const s = { ...newRun(seed), unlockedVenues: [...VENUE_IDS] };
    return reduce(s, { type: 'ENTER_VENUE', venue: 'blackjack' });
  }

  /** 把牌靴前幾張換成指定牌，方便做確定性的局。 */
  function rig(s: GameState, cards: number[]): GameState {
    if (s.venue?.kind !== 'blackjack') throw new Error('not blackjack');
    const shoe = [...s.venue.shoe];
    cards.forEach((c, i) => (shoe[i] = c));
    return { ...s, venue: { ...s.venue, shoe, cursor: 0 } };
  }

  const A = 0;
  const FIVE = 4;
  const SIX = 5;
  const SEVEN = 6;
  const EIGHT = 7;
  const NINE = 8;
  const TEN = 9;
  const K = 12;

  it('opens a 6-deck shoe and deals four cards', () => {
    let s = enterBj();
    expect(s.venue?.kind === 'blackjack' && s.venue.shoe.length).toBe(312);
    s = reduce(s, { type: 'BLACKJACK_DEAL', stake: 1000 });
    expect(s.cash).toBe(CONFIG.START_CASH - 1000);
    expect(s.stats.totalEvGiven).toBeCloseTo(1000 * CONFIG.BLACKJACK_BASE_EDGE);
    const round = s.venue?.kind === 'blackjack' ? s.venue.round : null;
    expect(round).not.toBeNull();
    if (round === null) return;
    expect(round.hands[0].cards).toHaveLength(2);
    expect(round.dealer).toHaveLength(2);
    expect(['PLAYER', 'DEALER']).toContain(round.stage);
    expect(reduce(s, { type: 'LEAVE_VENUE' })).toBe(s);
  });

  it('plays a rigged hand: player 16 vs 10 hits (correct), busts, loses, then can leave', () => {
    // 發牌順序 P, D, P, D, 然後玩家補牌
    let s = rig(enterBj(), [TEN, TEN, SIX, SEVEN, K]);
    s = reduce(s, { type: 'BLACKJACK_DEAL', stake: 1000 });
    s = reduce(s, { type: 'BLACKJACK_MOVE', move: 'hit' });
    expect(s.stats.bjDecisions).toBe(1);
    expect(s.stats.bjMistakes).toBe(0);
    const round = s.venue?.kind === 'blackjack' ? s.venue.round : null;
    expect(round?.stage).toBe('DEALER');
    expect(round?.payouts).toEqual([0]);
    expect(round?.dealer).toHaveLength(2); // 玩家爆了，莊家不補牌

    s = reduce(s, { type: 'BLACKJACK_RESOLVE' });
    expect(s.cash).toBe(CONFIG.START_CASH - 1000);
    expect(s.sanity).toBe(CONFIG.SANITY_START - CONFIG.GAMBLE_LOSS_SANITY);
    expect(s.venueNetToday).toBe(-1000);
    expect(s.venue?.kind === 'blackjack' && s.venue.round?.stage).toBe('DONE');
    expect(reduce(s, { type: 'LEAVE_VENUE' }).phase).toBe('ACTION');
  });

  it('standing on 16 vs 10 is a mistake and costs extra EV', () => {
    let s = rig(enterBj(), [TEN, TEN, SIX, SEVEN, K]);
    s = reduce(s, { type: 'BLACKJACK_DEAL', stake: 1000 });
    const evBefore = s.stats.totalEvGiven;
    s = reduce(s, { type: 'BLACKJACK_MOVE', move: 'stand' });
    expect(s.stats.bjMistakes).toBe(1);
    expect(s.stats.totalEvGiven).toBeCloseTo(evBefore + 1000 * CONFIG.BLACKJACK_MISTAKE_EDGE);
  });

  it('natural blackjack pays 3:2 immediately with the natural sanity bonus', () => {
    let s = rig(enterBj(), [A, NINE, K, SEVEN]);
    s = reduce(s, { type: 'BLACKJACK_DEAL', stake: 1000 });
    expect(s.venue?.kind === 'blackjack' && s.venue.round?.stage).toBe('DEALER');
    s = reduce(s, { type: 'BLACKJACK_RESOLVE' });
    expect(s.cash).toBe(CONFIG.START_CASH + 1500);
    expect(s.sanity).toBe(CONFIG.SANITY_START + CONFIG.BLACKJACK_NATURAL_SANITY);
  });

  it('double takes one card, doubles the stake, and records the extra wager', () => {
    // 玩家 5+6=11 vs 莊 9：加倍是正解
    let s = rig(enterBj(), [FIVE, NINE, SIX, SEVEN, K, EIGHT]);
    s = reduce(s, { type: 'BLACKJACK_DEAL', stake: 1000 });
    s = reduce(s, { type: 'BLACKJACK_MOVE', move: 'double' });
    expect(s.stats.bjMistakes).toBe(0);
    expect(s.stats.totalWagered).toBe(2000);
    const round = s.venue?.kind === 'blackjack' ? s.venue.round : null;
    expect(round?.hands[0].stake).toBe(2000);
    expect(round?.hands[0].cards).toHaveLength(3);
    expect(round?.stage).toBe('DEALER');
    s = reduce(s, { type: 'BLACKJACK_RESOLVE' });
    // 玩家 21 vs 莊 9+7+8=24 爆 → 贏 2000
    expect(s.cash).toBe(CONFIG.START_CASH + 2000);
  });

  it('split plays two hands in order and settles both', () => {
    // 玩家 8,8 vs 莊 6：分牌。分牌後各補一張：TEN, TEN。兩手 18 各停。莊 6+K=16 補 FIVE=21。
    let s = rig(enterBj(), [EIGHT, SIX, EIGHT, K, TEN, TEN, FIVE]);
    s = reduce(s, { type: 'BLACKJACK_DEAL', stake: 1000 });
    s = reduce(s, { type: 'BLACKJACK_MOVE', move: 'split' });
    expect(s.cash).toBe(CONFIG.START_CASH - 2000);
    let round = s.venue?.kind === 'blackjack' ? s.venue.round : null;
    expect(round?.hands).toHaveLength(2);
    expect(round?.active).toBe(0);
    expect(reduce(s, { type: 'BLACKJACK_MOVE', move: 'split' })).toBe(s); // 只能分一次

    s = reduce(s, { type: 'BLACKJACK_MOVE', move: 'stand' });
    round = s.venue?.kind === 'blackjack' ? s.venue.round : null;
    expect(round?.active).toBe(1);
    s = reduce(s, { type: 'BLACKJACK_MOVE', move: 'stand' });
    round = s.venue?.kind === 'blackjack' ? s.venue.round : null;
    expect(round?.stage).toBe('DEALER');
    expect(round?.dealer).toEqual([SIX, K, FIVE]);
    expect(round?.payouts).toEqual([0, 0]);
    s = reduce(s, { type: 'BLACKJACK_RESOLVE' });
    expect(s.venueNetToday).toBe(-2000);
  });

  it('rejects double or split without enough cash', () => {
    let s = rig(enterBj(), [EIGHT, SIX, EIGHT, K]);
    s = { ...s, cash: 1500 };
    s = reduce(s, { type: 'BLACKJACK_DEAL', stake: 1000 });
    expect(s.cash).toBe(500);
    expect(reduce(s, { type: 'BLACKJACK_MOVE', move: 'split' })).toBe(s);
    expect(reduce(s, { type: 'BLACKJACK_MOVE', move: 'double' })).toBe(s);
    expect(reduce(s, { type: 'BLACKJACK_MOVE', move: 'hit' })).not.toBe(s);
  });

  it('accuracy shows on the death card once decisions exist', () => {
    let s = rig(enterBj(), [TEN, TEN, SIX, SEVEN, K]);
    s = reduce(s, { type: 'BLACKJACK_DEAL', stake: 1000 });
    s = reduce(s, { type: 'BLACKJACK_MOVE', move: 'hit' });
    s = reduce(s, { type: 'BLACKJACK_RESOLVE' });
    const card = buildDeathCard({ ...s, phase: 'DEATH', venue: null });
    expect(card.lines.some((l) => l.label.includes('21 點') && l.value === '100%')).toBe(true);
  });
});

describe('scratch venue', () => {
  function enterScratch(seed = 5): GameState {
    const s = newRun(seed);
    return reduce(s, { type: 'ENTER_VENUE', venue: 'scratch' });
  }

  it('buying deducts price and sanity, rolls the prize up front, and blocks leaving', () => {
    let s = enterScratch();
    s = reduce(s, { type: 'SCRATCH_BUY', price: 100 });
    expect(s.cash).toBe(CONFIG.START_CASH - 100);
    expect(s.sanity).toBe(CONFIG.SANITY_START - CONFIG.SCRATCH_SANITY_COST);
    expect(s.stats.totalWagered).toBe(100);
    expect(s.stats.totalEvGiven).toBeCloseTo(100 * (1 - CONFIG.SCRATCH_RTP));
    const ticket = s.venue?.kind === 'scratch' ? s.venue.ticket : null;
    expect(ticket).not.toBeNull();
    expect(reduce(s, { type: 'SCRATCH_BUY', price: 100 })).toBe(s);
    expect(reduce(s, { type: 'LEAVE_VENUE' })).toBe(s);
  });

  it('rejects unknown prices and unaffordable tickets', () => {
    const s = enterScratch();
    expect(reduce(s, { type: 'SCRATCH_BUY', price: 150 })).toBe(s);
    const broke = { ...s, cash: 400 };
    expect(reduce(broke, { type: 'SCRATCH_BUY', price: 500 })).toBe(broke);
    expect(reduce(broke, { type: 'SCRATCH_BUY', price: 200 })).not.toBe(broke);
  });

  it('reveal pays the prize; win +3, break-even and loss leave sanity alone', () => {
    let s = enterScratch();
    s = reduce(s, { type: 'SCRATCH_BUY', price: 100 });
    if (s.venue?.kind !== 'scratch') throw new Error('not scratch');
    const cashBefore = s.cash;
    const sanityBefore = s.sanity;

    for (const prize of [0, 100, 500]) {
      const rigged: GameState = { ...s, venue: { ...s.venue, ticket: { price: 100, prize } } };
      const r = reduce(rigged, { type: 'SCRATCH_REVEAL' });
      expect(r.cash).toBe(cashBefore + prize);
      expect(r.sanity).toBe(prize > 100 ? sanityBefore + CONFIG.GAMBLE_WIN_SANITY : sanityBefore);
      expect(r.venueNetToday).toBe(prize - 100);
      expect(r.venue?.kind === 'scratch' && r.venue.handsPlayed).toBe(1);
      expect(r.venue?.kind === 'scratch' && r.venue.ticket).toBeNull();
      expect(r.venue?.kind === 'scratch' && r.venue.lastTicket?.prize).toBe(prize);
    }
  });

  it('tilt forces three tickets but never the 25% rule', () => {
    let s = { ...enterScratch(), tilt: true };
    expect(reduce(s, { type: 'LEAVE_VENUE' })).toBe(s);
    for (let i = 0; i < 3; i++) {
      s = reduce(s, { type: 'SCRATCH_BUY', price: 100 });
      expect(s.venue?.kind === 'scratch' && s.venue.ticket).not.toBeNull();
      s = reduce(s, { type: 'SCRATCH_REVEAL' });
    }
    expect(reduce(s, { type: 'LEAVE_VENUE' }).phase).toBe('ACTION');
  });
});

describe('crypto venue', () => {
  function makeCandles(closes: number[]): Candle[] {
    return closes.map((c, i) => {
      const open = i === 0 ? c : closes[i - 1];
      return [open, Math.max(open, c) + 10, Math.min(open, c) - 10, c];
    });
  }

  const pool: CryptoSegment[] = [
    { id: 'a', symbol: 'BTC', vol: 'low', candles: makeCandles([10000, 10050, 10100, 10150, 10200]) },
    { id: 'b', symbol: 'ETH', vol: 'high', candles: makeCandles([10000, 9900, 9000, 8000, 7000]) },
  ];

  function enterCrypto(seed = 3): GameState {
    const s = newRun(seed);
    return reduce(s, { type: 'ENTER_VENUE', venue: 'crypto' });
  }

  function withSegment(id: string, seed = 3): GameState {
    return reduce(enterCrypto(seed), { type: 'CRYPTO_NEW_SEGMENT', pool: pool.filter((p) => p.id === id) });
  }

  function markDone(s: GameState): GameState {
    if (s.venue?.kind !== 'crypto') throw new Error('not crypto');
    return { ...s, venue: { ...s.venue, roundDone: true } };
  }

  const open = (s: GameState, direction: 'long' | 'short', leverage: number, margin: number, tp: number | null = null, sl: number | null = null) =>
    reduce(s, { type: 'CRYPTO_OPEN', direction, leverage, margin, takeProfitPct: tp, stopLossPct: sl });

  it('draws unused segments first and resets when exhausted', () => {
    let s = reduce(enterCrypto(), { type: 'CRYPTO_NEW_SEGMENT', pool });
    const first = s.venue?.kind === 'crypto' ? s.venue.segment?.id : null;
    expect(first).toBeTruthy();
    expect(s.usedCryptoIds).toEqual([first]);
    expect(reduce(s, { type: 'CRYPTO_NEW_SEGMENT', pool })).toBe(s);
    s = reduce(markDone(s), { type: 'CRYPTO_NEW_SEGMENT', pool });
    const second = s.venue?.kind === 'crypto' ? s.venue.segment?.id : null;
    expect(second).not.toBe(first);
    expect(s.usedCryptoIds).toHaveLength(2);
    s = reduce(markDone(s), { type: 'CRYPTO_NEW_SEGMENT', pool });
    expect(s.usedCryptoIds).toHaveLength(1);
  });

  it('opens a position: deducts margin, records notional-based EV, starts playing', () => {
    const s = open(withSegment('a'), 'long', 10, 1000);
    expect(s.cash).toBe(CONFIG.START_CASH - 1000);
    expect(s.stats.totalWagered).toBe(1000);
    expect(s.stats.totalEvGiven).toBeCloseTo(10000 * (2 * CONFIG.CRYPTO_FEE + CONFIG.CRYPTO_SLIPPAGE));
    if (s.venue?.kind !== 'crypto') throw new Error('not crypto');
    expect(s.venue.playing).toBe(true);
    expect(s.venue.position?.entryPrice).toBeCloseTo(10002);
    expect(reduce(s, { type: 'LEAVE_VENUE' })).toBe(s);
    expect(open(s, 'long', 10, 1000)).toBe(s);
  });

  it('ticks to the end and auto-closes with profit for a long on a rising segment', () => {
    let s = open(withSegment('a'), 'long', 10, 1000);
    for (let i = 0; i < 10; i++) s = reduce(s, { type: 'CRYPTO_TICK' });
    if (s.venue?.kind !== 'crypto') throw new Error('not crypto');
    expect(s.venue.position).toBeNull();
    expect(s.venue.roundDone).toBe(true);
    expect(s.venue.lastResult?.reason).toBe('expired');
    expect(s.venue.cursor).toBe(4);
    const pnl = s.venue.lastResult?.pnl ?? 0;
    expect(pnl).toBeGreaterThan(0);
    expect(s.cash).toBe(CONFIG.START_CASH + pnl);
    expect(s.sanity).toBe(CONFIG.SANITY_START + CONFIG.GAMBLE_WIN_SANITY);
    expect(reduce(s, { type: 'CRYPTO_TICK' })).toBe(s);
    expect(reduce(s, { type: 'LEAVE_VENUE' }).phase).toBe('ACTION');
  });

  it('liquidates a 50x long on a crash: margin gone, sanity -15', () => {
    let s = open(withSegment('b'), 'long', 50, 2000);
    s = reduce(s, { type: 'CRYPTO_TICK' }); // 9900：跌 1%，50x 爆倉線 1.8%，未爆
    if (s.venue?.kind !== 'crypto') throw new Error('not crypto');
    expect(s.venue.position).not.toBeNull();
    s = reduce(s, { type: 'CRYPTO_TICK' }); // 9000：爆
    if (s.venue?.kind !== 'crypto') throw new Error('not crypto');
    expect(s.venue.lastResult?.reason).toBe('liquidated');
    expect(s.venue.lastResult?.pnl).toBe(-2000);
    expect(s.cash).toBe(CONFIG.START_CASH - 2000);
    expect(s.sanity).toBe(CONFIG.SANITY_START - CONFIG.CRYPTO_LIQ_SANITY);
    expect(s.stats.biggestLoss).toBe(-2000);
  });

  it('manual close settles at the current candle close with fees', () => {
    let s = open(withSegment('a'), 'short', 5, 1000);
    s = reduce(s, { type: 'CRYPTO_TICK' });
    s = reduce(s, { type: 'CRYPTO_CLOSE' });
    if (s.venue?.kind !== 'crypto') throw new Error('not crypto');
    expect(s.venue.lastResult?.reason).toBe('closed');
    expect(s.venue.lastResult?.exitPrice).toBe(10050);
    const pnl = s.venue.lastResult?.pnl ?? 0;
    expect(pnl).toBeLessThan(0);
    expect(s.cash).toBe(CONFIG.START_CASH + pnl);
  });

  it('take profit and stop loss trigger at their roi prices', () => {
    let s = open(withSegment('a'), 'long', 10, 1000, 10, null);
    s = reduce(s, { type: 'CRYPTO_TICK' }); // high 10060 < 停利價 10102
    s = reduce(s, { type: 'CRYPTO_TICK' }); // high 10110 >= 10102
    if (s.venue?.kind !== 'crypto') throw new Error('not crypto');
    expect(s.venue.lastResult?.reason).toBe('tp');

    let t = open(withSegment('b'), 'long', 10, 1000, null, 5);
    t = reduce(t, { type: 'CRYPTO_TICK' }); // low 9890 <= 停損價 9952
    if (t.venue?.kind !== 'crypto') throw new Error('not crypto');
    expect(t.venue.lastResult?.reason).toBe('sl');
  });

  it('rejects invalid opens', () => {
    const s = withSegment('a');
    expect(open(s, 'long', 10, 400)).toBe(s);
    expect(open(s, 'long', 0, 1000)).toBe(s);
    expect(open(s, 'long', CONFIG.CRYPTO_MAX_LEVERAGE + 1, 1000)).toBe(s);
    expect(open(s, 'long', 10, s.cash + 1)).toBe(s);
  });
});

describe('stocks', () => {
  function flatSeg(id: string, closes: number[]): StockSegment {
    return { id, market: 'TW', vol: 'low', closes };
  }
  // 20 支切片，160 天，各自不同斜率，讓市場能建起來
  const pool: StockSegment[] = Array.from({ length: 20 }, (_, i) =>
    flatSeg(`s${i}`, Array.from({ length: 160 }, (_, d) => 10000 + d * (i % 5) * 10)),
  );
  const names = Array.from({ length: 10 }, (_, i) => `公司${i}`);

  function withMarket(seed = 9): GameState {
    const s = newRun(seed);
    return reduce(s, { type: 'STOCK_OPEN_MARKET', pool, names });
  }

  /** 把第 slot 支的 closes 換成指定序列，方便做確定性測試 */
  function rigSlot(s: GameState, slot: number, closes: number[]): GameState {
    if (s.stockMarket === null) throw new Error('no market');
    const market = s.stockMarket.map((m, i) => (i === slot ? { ...m, closes } : m));
    return { ...s, stockMarket: market };
  }

  const flat = Array.from({ length: 200 }, () => 10000);

  it('opens the market once with five named stocks', () => {
    const s = withMarket();
    expect(s.stockMarket).toHaveLength(CONFIG.STOCK_MARKET_SIZE);
    expect(s.stockDayIndex).toBe(CONFIG.STOCK_VISIBLE_HISTORY);
    expect(reduce(s, { type: 'STOCK_OPEN_MARKET', pool, names })).toBe(s);
  });

  it('buy deducts cash and fee, costs sanity, records EV; sell realizes with tax', () => {
    let s = rigSlot(withMarket(), 0, flat);
    s = reduce(s, { type: 'STOCK_BUY', slot: 0, amount: 10000 });
    expect(s.cash).toBe(CONFIG.START_CASH - 10000);
    expect(s.sanity).toBe(CONFIG.SANITY_START - CONFIG.STOCK_TRADE_SANITY_COST);
    expect(s.stats.totalWagered).toBe(10000);
    expect(s.stats.totalEvGiven).toBeCloseTo(10000 * (2 * CONFIG.STOCK_FEE + CONFIG.STOCK_TAX));
    const pos = s.stockPositions[0];
    expect(pos.slot).toBe(0);
    expect(pos.units).toBeCloseTo((10000 - 14) / 100);
    expect(pos.avgCost).toBe(10000);

    // 價格沒動就賣：拿回 9986 - 手續費 14 - 稅 30 = 9942，實現 -44
    s = reduce(s, { type: 'STOCK_SELL', slot: 0, fraction: 1 });
    expect(s.stockPositions).toHaveLength(0);
    expect(s.cash).toBe(CONFIG.START_CASH - 10000 + 9942);
    expect(s.venueNetToday).toBe(-44);
    expect(s.sanity).toBe(CONFIG.SANITY_START - CONFIG.STOCK_TRADE_SANITY_COST * 2 - CONFIG.GAMBLE_LOSS_SANITY);
  });

  it('rejects tiny, unaffordable, or out-of-range buys and selling nothing', () => {
    const s = withMarket();
    expect(reduce(s, { type: 'STOCK_BUY', slot: 0, amount: 500 })).toBe(s);
    expect(reduce(s, { type: 'STOCK_BUY', slot: 0, amount: s.cash + 1 })).toBe(s);
    expect(reduce(s, { type: 'STOCK_BUY', slot: 9, amount: 1000 })).toBe(s);
    expect(reduce(s, { type: 'STOCK_SELL', slot: 0, fraction: 1 })).toBe(s);
  });

  it('averages cost on repeat buys and sells half', () => {
    let s = rigSlot(withMarket(), 1, [...flat.slice(0, 21), 20000, ...flat.slice(22)]);
    s = reduce(s, { type: 'STOCK_BUY', slot: 1, amount: 4000 }); // 100 元買約 39.94 股
    s = { ...s, stockDayIndex: 21 }; // 漲到 200 元
    s = reduce(s, { type: 'STOCK_BUY', slot: 1, amount: 4000 }); // 200 元買約 19.97 股
    const pos = s.stockPositions[0];
    expect(pos.avgCost).toBeCloseTo(13333, -1);
    s = reduce(s, { type: 'STOCK_SELL', slot: 1, fraction: 0.5 });
    expect(s.stockPositions[0].units).toBeCloseTo(pos.units / 2);
    expect(s.venueNetToday).toBeGreaterThan(0);
  });

  it('night close advances the day and charges underwater anxiety', () => {
    let s = rigSlot(withMarket(), 2, [...flat.slice(0, 21), 7000, ...flat.slice(22)]);
    s = reduce(s, { type: 'STOCK_BUY', slot: 2, amount: 5000 });
    const sanityBefore = s.sanity;
    s = reduce({ ...s, rngState: 0 }, { type: 'END_DAY' });
    expect(s.stockDayIndex).toBe(21);
    expect(s.sanity).toBeLessThanOrEqual(sanityBefore - CONFIG.STOCK_UNDERWATER_SANITY);
  });

  it('asks to liquidate when short, lets you sell during NIGHT, then settles', () => {
    let s = rigSlot(withMarket(), 0, flat);
    s = reduce(s, { type: 'STOCK_BUY', slot: 0, amount: 8000 });
    s = { ...s, cash: 100, rngState: 0 };
    s = reduce(s, { type: 'END_DAY' });
    s = passEvent(s);
    expect(s.night?.step).toBe('LIQUIDATE');
    if (s.night?.step !== 'LIQUIDATE') return;
    expect(s.night.shortfall).toBeGreaterThan(0);
    expect(reduce(s, { type: 'NEXT_DAY' })).toBe(s);
    expect(reduce(s, { type: 'STOCK_BUY', slot: 0, amount: 1000 })).toBe(s);

    s = reduce(s, { type: 'STOCK_SELL', slot: 0, fraction: 1 });
    expect(s.night?.step).toBe('LIQUIDATE');
    if (s.night?.step !== 'LIQUIDATE') return;
    expect(s.night.shortfall).toBe(0);
    expect(s.cash).toBeGreaterThan(s.dailyExpense);

    s = reduce(s, { type: 'NIGHT_SKIP_LIQUIDATE' });
    expect(s.night?.step).toBe('SETTLE');
    if (s.night?.step !== 'SETTLE') return;
    expect(s.night.autoLoan).toBe(0);
    expect(s.night.outcome).toBe('CONTINUE');
  });

  it('skipping liquidation falls back to the loan shark', () => {
    let s = rigSlot(withMarket(), 0, flat);
    s = reduce(s, { type: 'STOCK_BUY', slot: 0, amount: 8000 });
    s = { ...s, cash: 100, rngState: 0 };
    s = reduce(s, { type: 'END_DAY' });
    s = passEvent(s);
    s = reduce(s, { type: 'NIGHT_SKIP_LIQUIDATE' });
    expect(s.night?.step).toBe('SETTLE');
    if (s.night?.step !== 'SETTLE') return;
    expect(s.night.autoLoan).toBeGreaterThan(0);
    expect(s.stockPositions).toHaveLength(1);
  });

  it('net worth and peak include stock value', () => {
    let s = rigSlot(withMarket(), 0, [...flat.slice(0, 21), 15000, ...flat.slice(22)]);
    s = reduce(s, { type: 'STOCK_BUY', slot: 0, amount: 10000 });
    s = { ...s, stockDayIndex: 21 };
    s = reduce(s, { type: 'STOCK_SELL', slot: 0, fraction: 0.5 });
    expect(s.stats.peakNetWorth).toBeGreaterThan(CONFIG.START_CASH);
  });
});

describe('nba', () => {
  const day = (games: Omit<NbaGame, 'id'>[]): NbaGameDay => ({
    games: games.map((g, i) => ({ ...g, id: `t${i}` })),
  });
  const g = (home: string, away: string, hs: number, as: number, mlHome = 1.85, mlAway = 2.05, line = -2.5, total = 220): Omit<NbaGame, 'id'> => ({
    home,
    away,
    ml: { home: mlHome, away: mlAway },
    spread: { line, home: 1.91, away: 1.91 },
    total: { line: total, over: 1.91, under: 1.91 },
    score: { home: hs, away: as },
  });
  const pool: NbaGameDay[] = [
    day([g('湖人', '勇士', 112, 108), g('公牛', '熱火', 95, 101), g('尼克', '籃網', 120, 100)]),
    day([g('金塊', '太陽', 99, 100)]),
  ];

  function loaded(seed = 4): GameState {
    let s = newRun(seed);
    s = reduce(s, { type: 'NBA_LOAD_DAY', pool });
    if (s.nbaToday !== null && s.nbaToday.length === 0) {
      // 抽到無賽事日就強制指到第一個比賽日
      s = { ...s, nbaDayOrder: [0, 1], nbaDayIndex: 0, nbaToday: null, nbaTodayDay: 0 };
      s = reduce(s, { type: 'NBA_LOAD_DAY', pool });
    }
    return s;
  }

  const pick = (gameId: string, market: 'ml' | 'spread' | 'total' = 'ml', side: 'home' | 'away' | 'over' | 'under' = 'home') => ({ gameId, market, side });

  it('loads today once, builds a shuffled order, and only reloads on a new day', () => {
    const s = loaded();
    expect(s.nbaDayOrder).not.toBeNull();
    expect(s.nbaTodayDay).toBe(1);
    expect(s.nbaToday).not.toBeNull();
    expect(reduce(s, { type: 'NBA_LOAD_DAY', pool })).toBe(s);
  });

  it('places a single bet: fills odds from schedule, deducts stake and sanity, records EV', () => {
    let s = loaded();
    const game = s.nbaToday?.[0];
    if (game === undefined) throw new Error('no game');
    s = reduce(s, { type: 'NBA_BET', legs: [pick(game.id)], stake: 1000 });
    expect(s.nbaBets).toHaveLength(1);
    expect(s.nbaBets[0].legs[0].odds).toBe(game.ml.home);
    expect(s.cash).toBe(CONFIG.START_CASH - 1000);
    expect(s.sanity).toBe(CONFIG.SANITY_START - CONFIG.NBA_BET_SANITY_COST);
    expect(s.stats.totalEvGiven).toBeCloseTo(1000 * CONFIG.NBA_VIG);
    expect(s.stats.byVenue.nba.wagered).toBe(1000);
  });

  it('rejects bad stakes, unknown games, duplicate games, and a fourth parlay', () => {
    let s = loaded();
    const ids = (s.nbaToday ?? []).map((x) => x.id);
    if (ids.length < 2) return; // 抽到只有一場的比賽日
    expect(reduce(s, { type: 'NBA_BET', legs: [pick(ids[0])], stake: 100 })).toBe(s);
    expect(reduce(s, { type: 'NBA_BET', legs: [pick('nope')], stake: 1000 })).toBe(s);
    expect(reduce(s, { type: 'NBA_BET', legs: [pick(ids[0]), pick(ids[0], 'total', 'over')], stake: 1000 })).toBe(s);
    for (let i = 0; i < 3; i++) s = reduce(s, { type: 'NBA_BET', legs: [pick(ids[0]), pick(ids[1])], stake: 200 });
    expect(s.parlaysToday).toBe(3);
    expect(s.stats.parlaysPlaced).toBe(3);
    expect(reduce(s, { type: 'NBA_BET', legs: [pick(ids[0]), pick(ids[1])], stake: 200 })).toBe(s);
    expect(reduce(s, { type: 'NBA_BET', legs: [pick(ids[0])], stake: 200 })).not.toBe(s);
  });

  it('END_DAY goes to EVENING when bets exist, reveals one at a time, then to NIGHT', () => {
    let s = loaded();
    const games = s.nbaToday ?? [];
    if (games.length < 2) return;
    // 押主隊獨贏兩場：第一場湖人贏、第二場公牛輸（依 pool 第一天）
    s = reduce(s, { type: 'NBA_BET', legs: [pick(games[0].id)], stake: 1000 });
    s = reduce(s, { type: 'NBA_BET', legs: [pick(games[1].id)], stake: 500 });
    s = reduce(s, { type: 'END_DAY' });
    expect(s.phase).toBe('EVENING');
    expect(reduce(s, { type: 'EVENING_DONE' })).toBe(s);

    const cashBefore = s.cash;
    s = reduce(s, { type: 'EVENING_REVEAL' });
    expect(s.nbaResults).toHaveLength(1);
    expect(s.nbaBets).toHaveLength(1);
    const first = s.nbaResults[0];
    const expectedPayout = games[0].score.home > games[0].score.away ? Math.floor(1000 * games[0].ml.home) : 0;
    expect(first.payout).toBe(expectedPayout);
    expect(s.cash).toBe(cashBefore + expectedPayout);

    s = reduce(s, { type: 'EVENING_REVEAL' });
    expect(s.nbaBets).toHaveLength(0);
    expect(reduce(s, { type: 'EVENING_REVEAL' })).toBe(s);
    s = reduce(s, { type: 'EVENING_DONE' });
    expect(s.phase).toBe('NIGHT');
    s = passEvent(s);
    if (s.night?.step === 'LIQUIDATE') s = reduce(s, { type: 'NIGHT_SKIP_LIQUIDATE' });
    s = reduce(s, { type: 'NEXT_DAY' });
    expect(s.nbaResults).toHaveLength(0);
    expect(s.parlaysToday).toBe(0);
    expect(s.nbaTodayDay).not.toBe(s.day);
  });

  it('parlay pays the product and counts a win', () => {
    let s = loaded();
    s = { ...s, nbaToday: pool[0].games, nbaTodayDay: s.day };
    const [a, , c] = pool[0].games; // 湖人贏、尼克贏
    s = reduce(s, { type: 'NBA_BET', legs: [pick(a.id), pick(c.id)], stake: 1000 });
    s = reduce(s, { type: 'END_DAY' });
    s = reduce(s, { type: 'EVENING_REVEAL' });
    const r = s.nbaResults[0];
    expect(r.outcomes).toEqual(['win', 'win']);
    expect(r.payout).toBe(Math.floor(1000 * a.ml.home * c.ml.home));
    expect(s.stats.parlaysWon).toBe(1);
    expect(s.sanity).toBe(CONFIG.SANITY_START - CONFIG.NBA_BET_SANITY_COST + CONFIG.PARLAY_WIN_SANITY);
  });

  it('insider tip marks one game on the tip day', () => {
    let s = newRun(4);
    s = { ...s, insiderTipDay: 1, nbaDayOrder: [0], nbaDayIndex: 0 };
    s = reduce(s, { type: 'NBA_LOAD_DAY', pool });
    expect(s.insiderGameId).not.toBeNull();
    expect((s.nbaToday ?? []).some((x) => x.id === s.insiderGameId)).toBe(true);
  });
});
