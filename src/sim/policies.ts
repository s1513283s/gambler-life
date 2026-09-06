import { CONFIG } from '../config';
import { loanRoom } from '../engine/economy';
import type { Rng } from '../engine/rng';
import type { BaccaratSide, BlackjackMove, BlackjackRound, CryptoDirection, GameAction, GameState, NbaLegPick, VenueKind } from '../types';
import { canBetAt, minBetFor } from '../venues/betting';
import { basicStrategy, canSplitCards, handValue } from '../venues/blackjack';
import { companyNames, cryptoSegments, nbaDays, stockSegments } from './data';

/**
 * Policy 看到完整狀態，回傳下一個要 dispatch 的 action。
 * 場子上線後，policy 在 ACTION / VENUE phase 回傳進場、下注等 action，runner 不用改。
 */
export type Policy = (state: GameState, rng: Rng) => GameAction;

/** 只負責 ACTION / VENUE phase 的決策；phase 轉換與夜晚流程由 dailyPolicy 代管。 */
type DayChooser = (state: GameState, rng: Rng) => GameAction;

export function dailyPolicy(choose: DayChooser): Policy {
  return (state, rng) => {
    if (state.pendingUnlock !== null) return { type: 'ACK_UNLOCK' };
    switch (state.phase) {
      case 'ACTION':
      case 'VENUE':
        return choose(state, rng);
      case 'EVENING':
        return state.nbaBets.length > 0 ? { type: 'EVENING_REVEAL' } : { type: 'EVENING_DONE' };
      case 'NIGHT': {
        const night = state.night;
        if (night === null) throw new Error('NIGHT without report');
        if (night.step === 'EVENT') return { type: 'NIGHT_ACK_EVENT' };
        if (night.step === 'LIQUIDATE') {
          // 預設砍倉策略：一支一支全賣，補到夠為止
          if (night.shortfall > 0 && state.stockPositions.length > 0) {
            return { type: 'STOCK_SELL', slot: state.stockPositions[0].slot, fraction: 1 };
          }
          return { type: 'NIGHT_SKIP_LIQUIDATE' };
        }
        return night.outcome === 'RETIRE_OFFER' ? { type: 'RETIRE' } : { type: 'NEXT_DAY' };
      }
      default:
        throw new Error(`policy has no move for phase ${state.phase}`);
    }
  };
}

const WORK: GameAction = { type: 'WORK' };
const REST: GameAction = { type: 'REST' };
const END_DAY: GameAction = { type: 'END_DAY' };

/** 主行動用掉就收工。生病時想打工的 policy 改成休息，避免卡住。 */
function main(state: GameState, wanted: GameAction): GameAction {
  if (state.actionUsedToday) return END_DAY;
  if (wanted.type === 'WORK' && state.day <= state.workBlockedUntilDay) return REST;
  return wanted;
}

const workWorkRest = (s: GameState): GameAction => (s.day % 3 === 0 ? REST : WORK);

interface GamblerPlan {
  venue: VenueKind;
  hands: number; // 每天玩幾局
  stake: (s: GameState) => number; // 想押的注碼，會被夾進合法範圍
  /** 場內每一步的決策；回傳 null 表示這一局已結束可以繼續下一局 */
  inRound: (s: GameState) => GameAction | null;
  bet: (s: GameState, stake: number) => GameAction;
}

/**
 * 每天的賭客：精神低於上頭線就休息，否則進場玩 N 局再走。
 * 場內：局進行中交給 inRound；玩滿或現金不足就 LEAVE；否則下注。
 */
function gamblerDaily(plan: GamblerPlan): Policy {
  return dailyPolicy((s) => {
    if (s.phase === 'VENUE') {
      const session = s.venue;
      if (session === null) throw new Error('VENUE without session');
      const step = plan.inRound(s);
      if (step !== null) return step;
      const forced = s.tilt ? CONFIG.TILT_FORCED_HANDS : 0;
      const done = session.handsPlayed >= Math.max(plan.hands, forced);
      if (done || !canBetAt(plan.venue, s.cash)) return { type: 'LEAVE_VENUE' };
      const min = minBetFor(plan.venue, s.cash, s.tilt);
      const stake = Math.min(Math.max(Math.floor(plan.stake(s)), min), s.cash);
      return plan.bet(s, stake);
    }
    if (s.actionUsedToday) return END_DAY;
    if (s.sanity < CONFIG.TILT_THRESHOLD) return REST;
    if (!canBetAt(plan.venue, s.cash)) return main(s, WORK);
    // 地下場要先認識阿龍：借一單位開門，借不到就打工
    if (!s.unlockedVenues.includes(plan.venue)) {
      return loanRoom(s.debt) >= CONFIG.LOAN_UNIT ? { type: 'BORROW', amount: CONFIG.LOAN_UNIT } : main(s, WORK);
    }
    return { type: 'ENTER_VENUE', venue: plan.venue };
  });
}

function baccaratDaily(hands: number, side: BaccaratSide, stake: (s: GameState) => number): Policy {
  return gamblerDaily({
    venue: 'baccarat',
    hands,
    stake,
    inRound: (s) => (s.venue?.kind === 'baccarat' && s.venue.pending !== null ? { type: 'BACCARAT_RESOLVE' } : null),
    bet: (_s, stake) => ({ type: 'BACCARAT_BET', side, stake }),
  });
}

/** 每天買 N 張同面額；現金不夠該面額時退到買得起的最大面額。 */
function scratchDaily(hands: number, price: number): Policy {
  const affordable = (cash: number): number => {
    const options = CONFIG.SCRATCH_TICKETS.filter((t) => t.price <= Math.min(price, cash));
    return options.length === 0 ? price : options[options.length - 1].price;
  };
  return gamblerDaily({
    venue: 'scratch',
    hands,
    stake: (s) => affordable(s.cash),
    inRound: (s) => (s.venue?.kind === 'scratch' && s.venue.ticket !== null ? { type: 'SCRATCH_REVEAL' } : null),
    bet: (s, _stake) => ({ type: 'SCRATCH_BUY', price: affordable(s.cash) }),
  });
}

interface CryptoPlan {
  segments: number; // 每天玩幾段
  direction: CryptoDirection | 'random';
  leverage: number;
  marginRatio: number; // 現金比例
  takeProfitPct: number | null;
  stopLossPct: number | null;
}

/** 每天進幣圈開 N 段，每段開倉後一路 TICK 到結算。 */
function cryptoDaily(plan: CryptoPlan): Policy {
  return gamblerDaily({
    venue: 'crypto',
    hands: plan.segments,
    stake: (s) => s.cash * plan.marginRatio,
    inRound: (s) => (s.venue?.kind === 'crypto' && s.venue.position !== null ? { type: 'CRYPTO_TICK' } : null),
    bet: (s, stake) => {
      const session = s.venue?.kind === 'crypto' ? s.venue : null;
      if (session === null) throw new Error('not crypto');
      if (session.segment === null || session.roundDone) return { type: 'CRYPTO_NEW_SEGMENT', pool: cryptoSegments() };
      const direction: CryptoDirection = plan.direction === 'random' ? (s.rngState % 2 === 0 ? 'long' : 'short') : plan.direction;
      return {
        type: 'CRYPTO_OPEN',
        direction,
        leverage: plan.leverage,
        margin: stake,
        takeProfitPct: plan.takeProfitPct,
        stopLossPct: plan.stopLossPct,
      };
    },
  });
}

/** 股票不佔主行動：先做股票操作，再做 chooser 的主行動。 */
function withStocks(trade: (s: GameState) => GameAction | null, chooser: DayChooser): Policy {
  return dailyPolicy((s, rng) => {
    if (s.phase === 'ACTION') {
      if (s.stockMarket === null) return { type: 'STOCK_OPEN_MARKET', pool: stockSegments(), names: companyNames() };
      const t = trade(s);
      if (t !== null) return t;
    }
    return chooser(s, rng);
  });
}

/** 第一天把六成現金平均買五支，之後兩工一休抱著不動。 */
const buyAndHold = withStocks(
  (s) => {
    if (s.day !== 1 || s.stockPositions.length >= CONFIG.STOCK_MARKET_SIZE) return null;
    const slot = s.stockPositions.length;
    const amount = Math.floor((CONFIG.START_CASH * 0.6) / CONFIG.STOCK_MARKET_SIZE);
    return amount >= CONFIG.STOCK_MIN_LOT && s.cash >= amount ? { type: 'STOCK_BUY', slot, amount } : null;
  },
  (s) => main(s, workWorkRest(s)),
);

/**
 * 每天早上賣光昨天買的，主行動後再把兩成現金追今天漲最多的那支。手續費絞肉機。
 * 賣只在主行動前、買只在主行動後，一天各一次，不會在同一天來回打轉。
 */
const churn = withStocks(
  (s) => {
    const market = s.stockMarket;
    if (market === null) return null;
    if (!s.actionUsedToday) {
      return s.stockPositions.length > 0 ? { type: 'STOCK_SELL', slot: s.stockPositions[0].slot, fraction: 1 } : null;
    }
    if (s.stockPositions.length > 0 || s.day % 3 === 0) return null; // 休息日不追
    let best = 0;
    let bestRet = -Infinity;
    market.forEach((slot, i) => {
      const ret = slot.closes[s.stockDayIndex] / slot.closes[s.stockDayIndex - 1];
      if (ret > bestRet) {
        bestRet = ret;
        best = i;
      }
    });
    const amount = Math.floor(s.cash * 0.2);
    return amount >= CONFIG.STOCK_MIN_LOT ? { type: 'STOCK_BUY', slot: best, amount } : null;
  },
  (s) => main(s, workWorkRest(s)),
);

interface NbaPlan {
  legs: number; // 1 = 單注
  pickFavorite: boolean; // true 押獨贏熱門，false 押冷門
  cashRatio: number;
}

/** 每天載賽程、下一張注單，然後兩工一休。無賽事日照常打工。 */
function nbaDaily(plan: NbaPlan): Policy {
  return dailyPolicy((s) => {
    if (s.phase !== 'ACTION') throw new Error(`nba policy in ${s.phase}`);
    if (s.nbaToday === null || s.nbaTodayDay !== s.day) return { type: 'NBA_LOAD_DAY', pool: nbaDays() };
    const games = s.nbaToday;
    if (s.nbaBets.length === 0 && games.length >= plan.legs && s.cash >= CONFIG.NBA_MIN_BET) {
      const sorted = [...games].sort((a, b) => Math.abs(a.ml.home - a.ml.away) - Math.abs(b.ml.home - b.ml.away)).reverse();
      const legs: NbaLegPick[] = sorted.slice(0, plan.legs).map((g) => {
        const homeFav = g.ml.home < g.ml.away;
        const side = plan.pickFavorite === homeFav ? 'home' : 'away';
        return { gameId: g.id, market: 'ml', side };
      });
      const stake = Math.max(CONFIG.NBA_MIN_BET, Math.min(s.cash, Math.floor(s.cash * plan.cashRatio)));
      return { type: 'NBA_BET', legs, stake };
    }
    return main(s, workWorkRest(s));
  });
}

type BjBrain = (s: GameState, round: BlackjackRound) => BlackjackMove;

function blackjackDaily(hands: number, stake: (s: GameState) => number, brain: BjBrain): Policy {
  return gamblerDaily({
    venue: 'blackjack',
    hands,
    stake,
    inRound: (s) => {
      if (s.venue?.kind !== 'blackjack' || s.venue.round === null) return null;
      const round = s.venue.round;
      if (round.stage === 'DEALER') return { type: 'BLACKJACK_RESOLVE' };
      if (round.stage === 'DONE') return null;
      return { type: 'BLACKJACK_MOVE', move: brain(s, round) };
    },
    bet: (_s, stake) => ({ type: 'BLACKJACK_DEAL', stake }),
  });
}

const basicBrain: BjBrain = (s, round) => {
  const hand = round.hands[round.active];
  const canDouble = hand.cards.length === 2 && s.cash >= hand.stake;
  const canSplit = round.hands.length === 1 && canSplitCards(hand.cards) && s.cash >= hand.stake;
  return basicStrategy(hand.cards, round.dealer[0], { canDouble, canSplit });
};

/** 新手：12 以上就停，永不加倍分牌。 */
const neverBustBrain: BjBrain = (_s, round) => (handValue(round.hands[round.active].cards).total >= 12 ? 'stand' : 'hit');

export const POLICIES: Record<string, Policy> = {
  /** 天天打工，不管精神。 */
  pureWork: dailyPolicy((s) => main(s, WORK)),

  /** 兩工一休。 */
  workWorkRest: dailyPolicy((s) => main(s, workWorkRest(s))),

  /** 精神低於上頭線才休息。 */
  restWhenTilting: dailyPolicy((s) => main(s, s.sanity < CONFIG.TILT_THRESHOLD ? REST : WORK)),

  /** 精神不夠付明天打工就休息，永不上頭。 */
  neverTilt: dailyPolicy((s) =>
    main(s, s.sanity - CONFIG.WORK_SANITY_COST < CONFIG.TILT_THRESHOLD ? REST : WORK),
  ),

  /** 七成機率打工，三成休息。 */
  coinFlip: dailyPolicy((s, rng) => main(s, rng.chance(0.7) ? WORK : REST)),

  /** 兩工一休，手頭寬裕就還阿龍：現金超過三天開銷的部分拿去還。 */
  repayWhenFlush: dailyPolicy((s) => {
    const spare = s.cash - s.dailyExpense * 3;
    if (s.debt > 0 && spare >= CONFIG.LOAN_UNIT) return { type: 'REPAY', amount: Math.min(spare, s.debt) };
    return main(s, workWorkRest(s));
  }),

  /** 開局借滿放著不還，兩工一休。測試討債迴圈。 */
  maxLoanDayOne: dailyPolicy((s) => {
    if (s.day === 1 && s.debt === 0) return { type: 'BORROW', amount: CONFIG.LOAN_CAP };
    return main(s, workWorkRest(s));
  }),

  /** 每天押莊 10 局，平注 1,000。 */
  baccaratFlat: baccaratDaily(10, 'banker', () => 1000),

  /** 每天押莊 10 局，每局押現金 10%。 */
  baccaratTenPct: baccaratDaily(10, 'banker', (s) => s.cash * 0.1),

  /** 每天押閒 1 局，全下。極端變異。 */
  baccaratAllIn: baccaratDaily(1, 'player', (s) => s.cash),

  /** 每天押和 20 局，每局 500。負 EV 最深的選項。 */
  baccaratTie: baccaratDaily(20, 'tie', () => 500),

  /** 每天 10 局 21 點，平注 1,000，完美基本策略。 */
  blackjackBasic: blackjackDaily(10, () => 1000, basicBrain),

  /** 每天 10 局 21 點，平注 1,000，新手打法。 */
  blackjackNaive: blackjackDaily(10, () => 1000, neverBustBrain),

  /** 每天 10 張 100 元刮刮樂。 */
  scratchCheap: scratchDaily(10, 100),

  /** 每天 5 張 500 元，追百萬頭獎。 */
  scratchDream: scratchDaily(5, 500),

  /** 每天 3 段，10 倍，保證金 10% 現金，抱到底。 */
  cryptoTenX: cryptoDaily({ segments: 3, direction: 'random', leverage: 10, marginRatio: 0.1, takeProfitPct: null, stopLossPct: null }),

  /** 每天 3 段，50 倍，保證金 25% 現金，抱到底。 */
  cryptoFiftyX: cryptoDaily({ segments: 3, direction: 'random', leverage: 50, marginRatio: 0.25, takeProfitPct: null, stopLossPct: null }),

  /** 每天 5 段，25 倍，保證金 10%，停利 +100% 停損 -50%。 */
  cryptoTpSl: cryptoDaily({ segments: 5, direction: 'random', leverage: 25, marginRatio: 0.1, takeProfitPct: 100, stopLossPct: 50 }),

  /** 每天 1 段，50 倍，全下做多。 */
  cryptoYolo: cryptoDaily({ segments: 1, direction: 'long', leverage: 50, marginRatio: 1, takeProfitPct: null, stopLossPct: null }),

  /** 第一天六成現金買五支抱到死，兩工一休。 */
  stocksBuyHold: buyAndHold,

  /** 每天追漲殺跌兩成現金，兩工一休。 */
  stocksChurn: churn,

  /** 每天押最大熱門獨贏，一成現金，兩工一休。 */
  nbaFavorites: nbaDaily({ legs: 1, pickFavorite: true, cashRatio: 0.1 }),

  /** 每天押最大冷門獨贏，一成現金。 */
  nbaDogs: nbaDaily({ legs: 1, pickFavorite: false, cashRatio: 0.1 }),

  /** 每天三串一熱門，半成現金。 */
  nbaParlay3: nbaDaily({ legs: 3, pickFavorite: true, cashRatio: 0.05 }),

  /** 每天六串一熱門，兩成現金，追一夜翻身。 */
  nbaParlay6: nbaDaily({ legs: 6, pickFavorite: true, cashRatio: 0.2 }),

  /** 什麼都不做，只付開銷。 */
  idle: dailyPolicy(() => END_DAY),
};
