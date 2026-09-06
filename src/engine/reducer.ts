import { CONFIG } from '../config';
import {
  VENUE_IDS,
  type BackgroundId,
  type DayLog,
  type GameAction,
  type GameActionType,
  type GameState,
  type NightSettlement,
  type Phase,
  type RunMode,
  type RunStats,
  type VenueId,
  type VenueStats,
} from '../types';
import { cryptoClose, cryptoNewSegment, cryptoOpen, cryptoTick } from './cryptoReducer';
import { backgroundDef, clampSanity, expenseForDay, loanRoom, netWorth, nightlyInterest, wageFor, workSanityCostFor } from './economy';
import { applyEvent, rollEvent } from './events';
import { acceptManage, buyItem, buyPresale, collectLend, lend, richNight, sellPresale } from './richReducer';
import { eveningReveal, nbaBet, nbaLoadDay } from './nbaReducer';
import { stockBuy, stockNightlyClose, stockOpenMarket, stockSell } from './stockReducer';
import {
  longmenBet,
  longmenDeal,
  longmenResolve,
  niuniuBet,
  niuniuResolve,
  sicboBet,
  sicboResolve,
} from './undergroundReducer';
import { applyUnlocks, baseUnlocks } from './unlocks';
import {
  baccaratBet,
  baccaratResolve,
  blackjackDeal,
  blackjackMove,
  blackjackResolve,
  enterVenue,
  leaveVenue,
  scratchBuy,
  scratchReveal,
} from './venueReducer';
import { withPeak } from './venueShared';

/** 每個 action 允許出現的 phase。不在表內的組合一律忽略，這是重整與連點的第一道防線。 */
const ALLOWED: Record<GameActionType, readonly Phase[]> = {
  NEW_RUN: ['TITLE', 'DEATH', 'RETIRED'],
  ACK_UNLOCK: ['ACTION', 'VENUE', 'NIGHT'],
  BUY_ITEM: ['ACTION'],
  LEND: ['ACTION'],
  COLLECT_LEND: ['ACTION'],
  ACCEPT_MANAGE: ['ACTION'],
  BUY_PRESALE: ['ACTION'],
  SELL_PRESALE: ['ACTION'],
  WORK: ['ACTION'],
  REST: ['ACTION'],
  BORROW: ['ACTION', 'VENUE'],
  REPAY: ['ACTION', 'VENUE'],
  ENTER_VENUE: ['ACTION'],
  BACCARAT_BET: ['VENUE'],
  BACCARAT_RESOLVE: ['VENUE'],
  BLACKJACK_DEAL: ['VENUE'],
  BLACKJACK_MOVE: ['VENUE'],
  BLACKJACK_RESOLVE: ['VENUE'],
  SCRATCH_BUY: ['VENUE'],
  SCRATCH_REVEAL: ['VENUE'],
  CRYPTO_NEW_SEGMENT: ['VENUE'],
  CRYPTO_OPEN: ['VENUE'],
  CRYPTO_TICK: ['VENUE'],
  CRYPTO_CLOSE: ['VENUE'],
  SICBO_BET: ['VENUE'],
  SICBO_RESOLVE: ['VENUE'],
  NIUNIU_BET: ['VENUE'],
  NIUNIU_RESOLVE: ['VENUE'],
  LONGMEN_DEAL: ['VENUE'],
  LONGMEN_BET: ['VENUE'],
  LONGMEN_RESOLVE: ['VENUE'],
  STOCK_OPEN_MARKET: ['ACTION'],
  STOCK_BUY: ['ACTION'],
  STOCK_SELL: ['ACTION', 'NIGHT'],
  NIGHT_SKIP_LIQUIDATE: ['NIGHT'],
  NBA_LOAD_DAY: ['ACTION'],
  NBA_BET: ['ACTION'],
  EVENING_REVEAL: ['EVENING'],
  EVENING_DONE: ['EVENING'],
  LEAVE_VENUE: ['VENUE'],
  END_DAY: ['ACTION'],
  NIGHT_ACK_EVENT: ['NIGHT'],
  NEXT_DAY: ['NIGHT'],
  RETIRE: ['NIGHT'],
  BACK_TO_TITLE: ['DEATH', 'RETIRED'],
};

function emptyStats(startNetWorth: number): RunStats {
  const byVenue = {} as Record<VenueId, VenueStats>;
  for (const id of VENUE_IDS) byVenue[id] = { wagered: 0, net: 0, sessions: 0 };
  return {
    peakNetWorth: startNetWorth,
    totalWagered: 0,
    totalEvGiven: 0,
    biggestWin: 0,
    biggestLoss: 0,
    biggestWinDay: 0,
    biggestLossDay: 0,
    tiltEpisodes: 0,
    daysWorked: 0,
    daysGambled: 0,
    daysRested: 0,
    loansTaken: 0,
    totalBorrowed: 0,
    parlaysPlaced: 0,
    parlaysWon: 0,
    bjDecisions: 0,
    bjMistakes: 0,
    byVenue,
  };
}

export interface RunSetup {
  seed: number;
  runId: string;
  mode: RunMode;
  dailyKey: string | null;
  background: BackgroundId;
}

export function createRun(setup: RunSetup, phase: Phase): GameState {
  const bg = backgroundDef(setup.background);
  const state: GameState = {
    saveVersion: CONFIG.SAVE_VERSION,
    runId: setup.runId,
    seed: setup.seed,
    mode: setup.mode,
    dailyKey: setup.dailyKey,
    background: setup.background,
    rngState: setup.seed >>> 0,
    day: 1,
    phase,
    cash: bg.startCash,
    debt: bg.startDebt,
    sanity: CONFIG.SANITY_START,
    tilt: false,
    dailyExpense: expenseForDay(1, bg.expenseMultiplier),
    expenseMultiplier: bg.expenseMultiplier,
    actionUsedToday: false,
    todayAction: 'NONE',
    workBlockedUntilDay: 0,
    insiderTipDay: 0,
    venue: null,
    venueNetToday: 0,
    usedCryptoIds: [],
    nbaBets: [],
    nbaDayOrder: null,
    nbaToday: null,
    nbaTodayDay: 0,
    insiderGameId: null,
    nbaResults: [],
    parlaysToday: 0,
    nbaDayIndex: 0,
    stockMarket: null,
    stockPositions: [],
    stockDayIndex: 0,
    unlockedVenues: baseUnlocks(),
    pendingUnlock: null,
    daysMaxedOut: 0,
    expenseGrowth: CONFIG.EXPENSE_GROWTH,
    loanSharkGone: false,
    purchases: [],
    lends: [],
    managed: null,
    property: null,
    night: null,
    stats: emptyStats(bg.startCash - bg.startDebt),
    history: [],
  };
  // 開局就欠錢的背景已經「認識阿龍」，直接開第一層，不播對話
  return applyUnlocks(state, true);
}

/** 尚未開局的空狀態。 */
export function createTitleState(): GameState {
  return createRun({ seed: 0, runId: '', mode: 'free', dailyKey: null, background: 'normal' }, 'TITLE');
}

export function canWorkToday(state: GameState): boolean {
  return !state.actionUsedToday && state.day > state.workBlockedUntilDay;
}

/** 上頭判定：低於門檻進入，高於解除線才離開，中間維持原狀。 */
function resolveTilt(state: GameState): Pick<GameState, 'tilt' | 'stats'> {
  if (!state.tilt && state.sanity < CONFIG.TILT_THRESHOLD) {
    return { tilt: true, stats: { ...state.stats, tiltEpisodes: state.stats.tiltEpisodes + 1 } };
  }
  if (state.tilt && state.sanity >= CONFIG.TILT_EXIT) {
    return { tilt: false, stats: state.stats };
  }
  return { tilt: state.tilt, stats: state.stats };
}

/** END_DAY：股票收盤 -> 擲事件並套用效果。有事件就停在 EVENT 步等玩家確認，無事直接往下。 */
function beginNight(state: GameState): GameState {
  const closed = stockNightlyClose(state);
  const roll = rollEvent(closed.rngState, closed.todayAction === 'WORK');
  const withEvent = applyEvent({ ...closed, rngState: roll.rngState }, roll.event);
  if (roll.event.id === 'nothing') return afterEvent(withEvent);
  return { ...withEvent, phase: 'NIGHT', night: { step: 'EVENT', event: roll.event.id } };
}

/** 事件之後：付不出開銷且有持股就先問要不要砍倉，否則直接結算。 */
function afterEvent(state: GameState): GameState {
  const shortfall = state.dailyExpense - state.cash;
  if (shortfall > 0 && state.stockPositions.length > 0) {
    return { ...state, phase: 'NIGHT', night: { step: 'LIQUIDATE', shortfall } };
  }
  return settleNight(state);
}

/**
 * 依規格第 3 節 NIGHT 順序結算：開銷 -> 自動借款 -> 利息 -> 討債 -> 派人 -> 倒數 -> 死亡 -> 上岸。
 * 阿龍的三段升級：欠超過討債線每晚扣精神；欠超過派人線明天不能打工；借滿連續幾晚就被帶走。
 */
function settleNight(input: GameState): GameState {
  const rich = richNight(input);
  const state = rich.state;
  const expense = state.dailyExpense;
  let cash = state.cash - expense;
  let debt = state.debt;
  let sanity = state.sanity;
  let loansTaken = state.stats.loansTaken;
  let totalBorrowed = state.stats.totalBorrowed;
  let autoLoan = 0;
  let deathCause: NightSettlement['deathCause'] = null;

  if (cash < 0) {
    const shortfall = -cash;
    if (!state.loanSharkGone && loanRoom(debt) >= shortfall) {
      autoLoan = shortfall;
      loansTaken += 1;
      totalBorrowed += shortfall;
      cash = 0;
    } else {
      deathCause = 'RENT';
    }
  }

  const interest = nightlyInterest(debt);
  debt = debt + interest + autoLoan;

  const harassed = !state.loanSharkGone && debt > CONFIG.DEBT_HARASS_THRESHOLD;
  if (harassed) sanity = clampSanity(sanity - CONFIG.HARASS_SANITY_COST);

  const thug = !state.loanSharkGone && debt > CONFIG.DEBT_THUG_THRESHOLD;
  let workBlockedUntilDay = state.workBlockedUntilDay;
  if (thug) {
    sanity = clampSanity(sanity - CONFIG.THUG_SANITY_COST);
    workBlockedUntilDay = Math.max(workBlockedUntilDay, state.day + 1);
  }

  const maxedOut = debt >= CONFIG.LOAN_CAP;
  const daysMaxedOut = maxedOut ? state.daysMaxedOut + 1 : 0;
  const deadlineDaysLeft = maxedOut ? Math.max(0, CONFIG.DEBT_DEADLINE_DAYS - daysMaxedOut) : null;

  if (deathCause === null && rich.clientDeath) deathCause = 'CLIENT';
  if (deathCause === null && sanity <= 0) deathCause = 'SANITY';
  if (deathCause === null && maxedOut && daysMaxedOut >= CONFIG.DEBT_DEADLINE_DAYS) deathCause = 'LOAN_SHARK';

  const settled: GameState = applyUnlocks({
    ...state,
    cash,
    debt,
    sanity,
    workBlockedUntilDay,
    daysMaxedOut,
    stats: { ...state.stats, loansTaken, totalBorrowed },
  });

  let outcome: NightSettlement['outcome'] = 'CONTINUE';
  if (deathCause !== null) outcome = 'DEATH';
  else if (netWorth(settled) >= CONFIG.RETIRE_THRESHOLD) outcome = 'RETIRE_OFFER';

  const log: DayLog = {
    day: state.day,
    cash,
    debt,
    sanity,
    action: state.todayAction,
    venueNet: state.venueNetToday,
    expense,
  };

  return withPeak({
    ...settled,
    phase: 'NIGHT',
    night: {
      step: 'SETTLE',
      expense,
      autoLoan,
      interest,
      harassed,
      thug,
      deadlineDaysLeft,
      lendInterest: rich.lendInterest,
      lendDefaulted: rich.lendDefaulted,
      propertyChange: rich.propertyChange,
      propertyMarginCall: rich.propertyMarginCall,
      managedSettled: rich.managedSettled,
      outcome,
      deathCause,
    },
    history: [...state.history, log],
  });
}

/** NEXT_DAY：翻日直接進 ACTION，或依結算結果進 DEATH。 */
function rollover(state: GameState): GameState {
  const night = state.night;
  if (night === null || night.step !== 'SETTLE') return state;

  if (night.outcome === 'DEATH' && night.deathCause !== null) {
    return {
      ...state,
      phase: 'DEATH',
      night: null,
      stats: { ...state.stats, causeOfDeath: night.deathCause },
    };
  }

  const day = state.day + 1;
  return {
    ...state,
    ...resolveTilt(state),
    day,
    phase: 'ACTION',
    dailyExpense: expenseForDay(day, state.expenseMultiplier, state.expenseGrowth),
    actionUsedToday: false,
    todayAction: 'NONE',
    venueNetToday: 0,
    nbaDayIndex: state.nbaDayIndex + 1,
    nbaResults: [],
    parlaysToday: 0,
    insiderGameId: null,
    night: null,
  };
}

/** 任何狀態變動後都重算解鎖，第三層靠淨值峰值，哪個 action 推上去的都算。 */
export function reduce(state: GameState, action: GameAction): GameState {
  if (!ALLOWED[action.type].includes(state.phase)) return state;
  const next = reduceInner(state, action);
  return next === state ? state : applyUnlocks(next);
}

function reduceInner(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'NEW_RUN':
      return createRun(action, 'ACTION');

    case 'ACK_UNLOCK':
      return state.pendingUnlock === null ? state : { ...state, pendingUnlock: null };

    case 'WORK': {
      if (!canWorkToday(state)) return state;
      return withPeak({
        ...state,
        cash: state.cash + wageFor(state),
        sanity: clampSanity(state.sanity - workSanityCostFor(state)),
        actionUsedToday: true,
        todayAction: 'WORK',
        stats: { ...state.stats, daysWorked: state.stats.daysWorked + 1 },
      });
    }

    case 'REST': {
      if (state.actionUsedToday) return state;
      return {
        ...state,
        sanity: clampSanity(state.sanity + CONFIG.REST_SANITY_GAIN),
        actionUsedToday: true,
        todayAction: 'REST',
        stats: { ...state.stats, daysRested: state.stats.daysRested + 1 },
      };
    }

    case 'BORROW': {
      const amount = Math.min(Math.floor(action.amount), loanRoom(state.debt));
      if (amount <= 0 || state.loanSharkGone) return state;
      return applyUnlocks({
        ...state,
        cash: state.cash + amount,
        debt: state.debt + amount,
        stats: { ...state.stats, loansTaken: state.stats.loansTaken + 1, totalBorrowed: state.stats.totalBorrowed + amount },
      });
    }

    case 'REPAY': {
      const amount = Math.min(Math.floor(action.amount), state.cash, state.debt);
      if (amount <= 0) return state;
      return withPeak({ ...state, cash: state.cash - amount, debt: state.debt - amount });
    }

    case 'BUY_ITEM':
      return buyItem(state, action.item);

    case 'LEND':
      return lend(state, action.amount);

    case 'COLLECT_LEND':
      return collectLend(state, action.index);

    case 'ACCEPT_MANAGE':
      return acceptManage(state);

    case 'BUY_PRESALE':
      return buyPresale(state, action.amount);

    case 'SELL_PRESALE':
      return sellPresale(state);

    case 'ENTER_VENUE':
      return enterVenue(state, action.venue);

    case 'BACCARAT_BET':
      return baccaratBet(state, action.side, action.stake);

    case 'BACCARAT_RESOLVE':
      return baccaratResolve(state);

    case 'BLACKJACK_DEAL':
      return blackjackDeal(state, action.stake);

    case 'BLACKJACK_MOVE':
      return blackjackMove(state, action.move);

    case 'BLACKJACK_RESOLVE':
      return blackjackResolve(state);

    case 'SCRATCH_BUY':
      return scratchBuy(state, action.price);

    case 'SCRATCH_REVEAL':
      return scratchReveal(state);

    case 'CRYPTO_NEW_SEGMENT':
      return cryptoNewSegment(state, action.pool);

    case 'CRYPTO_OPEN':
      return cryptoOpen(state, action);

    case 'CRYPTO_TICK':
      return cryptoTick(state);

    case 'CRYPTO_CLOSE':
      return cryptoClose(state);

    case 'SICBO_BET':
      return sicboBet(state, action.bet, action.stake);

    case 'SICBO_RESOLVE':
      return sicboResolve(state);

    case 'NIUNIU_BET':
      return niuniuBet(state, action.stake);

    case 'NIUNIU_RESOLVE':
      return niuniuResolve(state);

    case 'LONGMEN_DEAL':
      return longmenDeal(state);

    case 'LONGMEN_BET':
      return longmenBet(state, action.stake);

    case 'LONGMEN_RESOLVE':
      return longmenResolve(state);

    case 'LEAVE_VENUE':
      return leaveVenue(state);

    case 'STOCK_OPEN_MARKET':
      return stockOpenMarket(state, action.pool, action.names);

    case 'STOCK_BUY':
      return stockBuy(state, action.slot, action.amount);

    case 'STOCK_SELL':
      if (state.phase === 'NIGHT' && state.night?.step !== 'LIQUIDATE') return state;
      return stockSell(state, action.slot, action.fraction);

    case 'NIGHT_ACK_EVENT':
      return state.night?.step === 'EVENT' ? afterEvent(state) : state;

    case 'NIGHT_SKIP_LIQUIDATE':
      return state.night?.step === 'LIQUIDATE' ? settleNight(state) : state;

    case 'END_DAY':
      // 有待結算的 NBA 注單先進 EVENING 逐張揭曉，否則直接入夜
      return state.nbaBets.length > 0 ? { ...state, phase: 'EVENING', nbaResults: [] } : beginNight(state);

    case 'NBA_LOAD_DAY':
      return nbaLoadDay(state, action.pool);

    case 'NBA_BET':
      return nbaBet(state, action.legs, action.stake);

    case 'EVENING_REVEAL':
      return eveningReveal(state);

    case 'EVENING_DONE':
      return state.nbaBets.length === 0 ? beginNight(state) : state;

    case 'NEXT_DAY':
      return rollover(state);

    case 'RETIRE': {
      if (state.night?.step !== 'SETTLE' || state.night.outcome !== 'RETIRE_OFFER') return state;
      return { ...state, phase: 'RETIRED', night: null };
    }

    case 'BACK_TO_TITLE':
      return createTitleState();
  }
}
