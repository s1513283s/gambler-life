import { CONFIG } from '../config';
import {
  VENUE_IDS,
  type DayLog,
  type GameAction,
  type GameActionType,
  type GameState,
  type NightSettlement,
  type Phase,
  type RunStats,
  type VenueId,
  type VenueStats,
} from '../types';
import { clampSanity, expenseForDay, loanRoom, netWorth, nightlyInterest } from './economy';
import { cryptoClose, cryptoNewSegment, cryptoOpen, cryptoTick } from './cryptoReducer';
import { applyEvent, rollEvent } from './events';
import { eveningReveal, nbaBet, nbaLoadDay } from './nbaReducer';
import { stockBuy, stockNightlyClose, stockOpenMarket, stockSell } from './stockReducer';
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

/** 每個 action 允許出現的 phase。不在表內的組合一律忽略，這是重整與連點的第一道防線。 */
const ALLOWED: Record<GameActionType, readonly Phase[]> = {
  NEW_RUN: ['TITLE', 'DEATH', 'RETIRED'],
  START_DAY: ['MORNING'],
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

function emptyStats(): RunStats {
  const byVenue = {} as Record<VenueId, VenueStats>;
  for (const id of VENUE_IDS) byVenue[id] = { wagered: 0, net: 0, sessions: 0 };
  return {
    peakNetWorth: CONFIG.START_CASH,
    totalWagered: 0,
    totalEvGiven: 0,
    biggestWin: 0,
    biggestLoss: 0,
    tiltEpisodes: 0,
    daysWorked: 0,
    daysGambled: 0,
    daysRested: 0,
    loansTaken: 0,
    parlaysPlaced: 0,
    parlaysWon: 0,
    bjDecisions: 0,
    bjMistakes: 0,
    byVenue,
  };
}

export function createRun(seed: number, runId: string, phase: Phase): GameState {
  return {
    saveVersion: CONFIG.SAVE_VERSION,
    runId,
    seed,
    rngState: seed >>> 0,
    day: 1,
    phase,
    cash: CONFIG.START_CASH,
    debt: 0,
    sanity: CONFIG.SANITY_START,
    tilt: false,
    dailyExpense: expenseForDay(1, 1),
    expenseMultiplier: 1,
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
    unlockedVenues: [...VENUE_IDS],
    night: null,
    stats: emptyStats(),
    history: [],
  };
}

/** 尚未開局的空狀態。 */
export function createTitleState(): GameState {
  return createRun(0, '', 'TITLE');
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

function withPeak(state: GameState): GameState {
  const worth = netWorth(state);
  if (worth <= state.stats.peakNetWorth) return state;
  return { ...state, stats: { ...state.stats, peakNetWorth: worth } };
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

/** 依規格第 3 節 NIGHT 順序結算：開銷 -> 自動借款 -> 利息 -> 討債 -> 死亡 -> 上岸。 */
function settleNight(state: GameState): GameState {
  const expense = state.dailyExpense;
  let cash = state.cash - expense;
  let debt = state.debt;
  let sanity = state.sanity;
  let loansTaken = state.stats.loansTaken;
  let autoLoan = 0;
  let deathCause: NightSettlement['deathCause'] = null;

  if (cash < 0) {
    const shortfall = -cash;
    if (loanRoom(debt) >= shortfall) {
      autoLoan = shortfall;
      loansTaken += 1;
      cash = 0;
    } else {
      deathCause = 'RENT';
    }
  }

  const interest = nightlyInterest(debt);
  debt = debt + interest + autoLoan;

  const harassed = debt > CONFIG.DEBT_HARASS_THRESHOLD;
  if (harassed) sanity = clampSanity(sanity - CONFIG.HARASS_SANITY_COST);

  if (deathCause === null && sanity <= 0) deathCause = 'SANITY';

  const settled: GameState = {
    ...state,
    cash,
    debt,
    sanity,
    stats: { ...state.stats, loansTaken },
  };

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
    night: { step: 'SETTLE', expense, autoLoan, interest, harassed, outcome, deathCause },
    history: [...state.history, log],
  });
}

/** NEXT_DAY：翻日，或依結算結果進 DEATH。 */
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
    phase: 'MORNING',
    dailyExpense: expenseForDay(day, state.expenseMultiplier),
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

export function reduce(state: GameState, action: GameAction): GameState {
  if (!ALLOWED[action.type].includes(state.phase)) return state;

  switch (action.type) {
    case 'NEW_RUN':
      return createRun(action.seed, action.runId, 'MORNING');

    case 'START_DAY':
      return { ...state, phase: 'ACTION' };

    case 'WORK': {
      if (!canWorkToday(state)) return state;
      return withPeak({
        ...state,
        cash: state.cash + CONFIG.WAGE,
        sanity: clampSanity(state.sanity - CONFIG.WORK_SANITY_COST),
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
      if (amount <= 0) return state;
      return {
        ...state,
        cash: state.cash + amount,
        debt: state.debt + amount,
        stats: { ...state.stats, loansTaken: state.stats.loansTaken + 1 },
      };
    }

    case 'REPAY': {
      const amount = Math.min(Math.floor(action.amount), state.cash, state.debt);
      if (amount <= 0) return state;
      return withPeak({ ...state, cash: state.cash - amount, debt: state.debt - amount });
    }

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

    case 'LEAVE_VENUE':
      return leaveVenue(state);

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
