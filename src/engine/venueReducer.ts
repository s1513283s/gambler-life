import { CONFIG } from '../config';
import type {
  BaccaratSession,
  BaccaratSide,
  BjHand,
  BlackjackMove,
  BlackjackRound,
  BlackjackSession,
  GameState,
  ScratchSession,
  VenueKind,
  VenueSession,
} from '../types';
import { dealHand, needsReshuffle as baccaratNeedsReshuffle, payoutFor } from '../venues/baccarat';
import { canBetAt, isValidStake } from '../venues/betting';
import {
  basicStrategy,
  canSplitCards,
  cardPoints,
  dealerPlay,
  handValue,
  isNatural,
  needsReshuffle as blackjackNeedsReshuffle,
  settleHand,
} from '../venues/blackjack';
import { newShoe } from '../venues/cards';
import { rollPrize, scratchEdge, ticketDef } from '../venues/scratch';
import { newCryptoSession } from './cryptoReducer';
import { newLongmenSession, newNiuniuSession, newSicboSession } from './undergroundReducer';
import { isUnlocked } from './unlocks';
import { clampSanity } from './economy';
import { applyRoundResult, recordWager, winLossSanity } from './venueShared';

/** ENTER_VENUE：佔主行動，開新牌靴。 */
export function enterVenue(state: GameState, kind: VenueKind, vip = false): GameState {
  if (state.actionUsedToday || !isUnlocked(state, kind)) return state;
  if (vip && (kind !== 'baccarat' || !isUnlocked(state, 'lending'))) return state;

  let rngState = state.rngState;
  let session: VenueSession;
  if (kind === 'baccarat') {
    const shoe = newShoe(CONFIG.BACCARAT_DECKS, rngState);
    rngState = shoe.rngState;
    session = { kind, vip, road: [], shoe: shoe.cards, cursor: 0, handsPlayed: 0, net: 0, pending: null, lastResult: null };
  } else if (kind === 'blackjack') {
    const shoe = newShoe(CONFIG.BLACKJACK_DECKS, rngState);
    rngState = shoe.rngState;
    session = { kind, shoe: shoe.cards, cursor: 0, handsPlayed: 0, net: 0, round: null };
  } else if (kind === 'scratch') {
    session = { kind, handsPlayed: 0, net: 0, ticket: null, lastTicket: null };
  } else if (kind === 'crypto') {
    session = newCryptoSession();
  } else if (kind === 'sicbo') {
    session = newSicboSession();
  } else if (kind === 'niuniu') {
    const built = newNiuniuSession(rngState);
    session = built.session;
    rngState = built.rngState;
  } else {
    const built = newLongmenSession(rngState);
    session = built.session;
    rngState = built.rngState;
  }

  const byVenue = { ...state.stats.byVenue };
  byVenue[kind] = { ...byVenue[kind], sessions: byVenue[kind].sessions + 1 };
  const visited = state.stats.venuesVisited.includes(kind) ? state.stats.venuesVisited : [...state.stats.venuesVisited, kind];
  return {
    ...state,
    phase: 'VENUE',
    rngState,
    actionUsedToday: true,
    todayAction: 'GAMBLE',
    venue: session,
    venueStreak: 0,
    stats: { ...state.stats, daysGambled: state.stats.daysGambled + 1, byVenue, venuesVisited: visited },
  };
}

/** 上頭時還沒玩滿強制局數、且還下得起注，就不能走。 */
export function forcedHandsLeft(state: GameState): number {
  const session = state.venue;
  if (session === null || !state.tilt || !canBetAt(session.kind, state.cash)) return 0;
  return Math.max(0, CONFIG.TILT_FORCED_HANDS - session.handsPlayed);
}

function roundInProgress(session: VenueSession): boolean {
  switch (session.kind) {
    case 'baccarat':
      return session.pending !== null;
    case 'blackjack':
      return session.round !== null && session.round.stage !== 'DONE';
    case 'scratch':
      return session.ticket !== null;
    case 'crypto':
      return session.position !== null;
    case 'sicbo':
    case 'niuniu':
      return session.pending !== null;
    case 'longmen':
      return session.round !== null && session.round.stake !== null;
  }
}

export function leaveVenue(state: GameState): GameState {
  const session = state.venue;
  if (session === null || roundInProgress(session)) return state;
  if (forcedHandsLeft(state) > 0) return state;
  return { ...state, phase: 'ACTION', venue: null };
}

// ---------- 百家樂 ----------

/** BACCARAT_BET：驗注碼、必要時重洗、發牌、扣注金。派彩留給 RESOLVE。 */
export function baccaratBet(state: GameState, side: BaccaratSide, stake: number): GameState {
  const session = state.venue;
  if (session === null || session.kind !== 'baccarat' || session.pending !== null) return state;
  if (!isValidStake('baccarat', stake, state.cash, state.tilt)) return state;
  if (session.vip && stake < Math.min(CONFIG.VIP_MIN_BET, state.cash)) return state;

  let shoe = session.shoe;
  let cursor = session.cursor;
  let rngState = state.rngState;
  if (baccaratNeedsReshuffle(shoe.length, cursor)) {
    const fresh = newShoe(CONFIG.BACCARAT_DECKS, rngState);
    shoe = fresh.cards;
    cursor = 0;
    rngState = fresh.rngState;
  }

  const dealt = dealHand(shoe, cursor);
  const edge = session.vip && side === 'banker' ? CONFIG.VIP_BANKER_EDGE : CONFIG.BACCARAT_EDGE[side];
  const wagered = recordWager(state, 'baccarat', stake, stake * edge);
  return {
    ...wagered,
    rngState,
    cash: state.cash - stake,
    venue: { ...session, shoe, cursor: dealt.cursor, pending: { side, stake, hand: dealt.hand } },
  };
}

/** BACCARAT_RESOLVE：派彩、精神、統計。 */
export function baccaratResolve(state: GameState): GameState {
  const session = state.venue;
  if (session === null || session.kind !== 'baccarat' || session.pending === null) return state;

  const pending = session.pending;
  const payout = payoutFor(pending.side, pending.stake, pending.hand.outcome, session.vip ? CONFIG.VIP_COMMISSION : CONFIG.BACCARAT_COMMISSION);
  const net = payout - pending.stake;
  const next: BaccaratSession = {
    ...session,
    handsPlayed: session.handsPlayed + 1,
    net: session.net + net,
    pending: null,
    lastResult: { ...pending, payout },
    road: [...session.road, pending.hand.outcome].slice(-CONFIG.BACCARAT_ROAD_LENGTH),
  };
  return applyRoundResult({ ...state, cash: state.cash + payout, venue: next }, 'baccarat', net, winLossSanity(net));
}

// ---------- 21 點 ----------

interface Draw {
  shoe: readonly number[];
  cursor: number;
}

function draw(d: Draw): number {
  const card = d.shoe[d.cursor];
  d.cursor += 1;
  return card;
}

/** 所有手牌都結束後：莊家補牌（全爆則只翻底牌）、算派彩，進 DEALER 階段。 */
function finishRound(session: BlackjackSession, round: BlackjackRound): BlackjackSession {
  const anyAlive = round.hands.some((h) => handValue(h.cards).total <= 21);
  const played = anyAlive ? dealerPlay(session.shoe, session.cursor, round.dealer) : { dealer: round.dealer, cursor: session.cursor };
  const payouts = round.hands.map((h) => settleHand(h, played.dealer));
  return {
    ...session,
    cursor: played.cursor,
    round: { ...round, dealer: played.dealer, stage: 'DEALER', payouts },
  };
}

/** 找下一手還沒結束的牌；沒有就收局。 */
function advance(session: BlackjackSession, round: BlackjackRound): BlackjackSession {
  const nextIdx = round.hands.findIndex((h) => !h.done);
  if (nextIdx === -1) return finishRound(session, round);
  return { ...session, round: { ...round, active: nextIdx } };
}

/** BLACKJACK_DEAL：驗注碼、必要時重洗、發四張、天生黑傑克直接進 DEALER。 */
export function blackjackDeal(state: GameState, stake: number): GameState {
  const session = state.venue;
  if (session === null || session.kind !== 'blackjack') return state;
  if (session.round !== null && session.round.stage !== 'DONE') return state;
  if (!isValidStake('blackjack', stake, state.cash, state.tilt)) return state;

  let shoe = session.shoe;
  let cursor = session.cursor;
  let rngState = state.rngState;
  if (blackjackNeedsReshuffle(shoe.length, cursor)) {
    const fresh = newShoe(CONFIG.BLACKJACK_DECKS, rngState);
    shoe = fresh.cards;
    cursor = 0;
    rngState = fresh.rngState;
  }

  const d: Draw = { shoe, cursor };
  const player = [draw(d)];
  const dealer = [draw(d)];
  player.push(draw(d));
  dealer.push(draw(d));

  const hand: BjHand = { cards: player, stake, done: false, fromSplit: false };
  let next: BlackjackSession = {
    ...session,
    shoe,
    cursor: d.cursor,
    round: { hands: [hand], active: 0, dealer, stage: 'PLAYER', payouts: [] },
  };
  if (isNatural(player) || isNatural(dealer)) {
    const round: BlackjackRound = { ...next.round!, hands: [{ ...hand, done: true }] };
    next = finishRound(next, round);
  }

  const wagered = recordWager(state, 'blackjack', stake, stake * CONFIG.BLACKJACK_BASE_EDGE);
  return { ...wagered, rngState, cash: state.cash - stake, venue: next };
}

/** BLACKJACK_MOVE：驗合法性、對照基本策略、套用動作、推進到下一手或收局。 */
export function blackjackMove(state: GameState, move: BlackjackMove): GameState {
  const session = state.venue;
  if (session === null || session.kind !== 'blackjack' || session.round === null) return state;
  const round = session.round;
  if (round.stage !== 'PLAYER') return state;

  const hand = round.hands[round.active];
  const canDouble = hand.cards.length === 2 && state.cash >= hand.stake;
  const canSplit = round.hands.length === 1 && canSplitCards(hand.cards) && state.cash >= hand.stake;
  if (move === 'double' && !canDouble) return state;
  if (move === 'split' && !canSplit) return state;

  const recommended = basicStrategy(hand.cards, round.dealer[0], { canDouble, canSplit });
  const mistake = move !== recommended;
  const judged: GameState = {
    ...state,
    stats: {
      ...state.stats,
      bjDecisions: state.stats.bjDecisions + 1,
      bjMistakes: state.stats.bjMistakes + (mistake ? 1 : 0),
      totalEvGiven: state.stats.totalEvGiven + (mistake ? hand.stake * CONFIG.BLACKJACK_MISTAKE_EDGE : 0),
    },
  };

  const d: Draw = { shoe: session.shoe, cursor: session.cursor };
  let cash = state.cash;
  let hands = round.hands;

  const finish = (h: BjHand): BjHand => ({ ...h, done: h.done || handValue(h.cards).total >= 21 });

  switch (move) {
    case 'hit':
      hands = hands.map((h, i) => (i === round.active ? finish({ ...h, cards: [...h.cards, draw(d)] }) : h));
      break;
    case 'stand':
      hands = hands.map((h, i) => (i === round.active ? { ...h, done: true } : h));
      break;
    case 'double':
      cash -= hand.stake;
      hands = hands.map((h, i) =>
        i === round.active ? { ...h, cards: [...h.cards, draw(d)], stake: h.stake * 2, done: true } : h,
      );
      break;
    case 'split': {
      cash -= hand.stake;
      const aces = cardPoints(hand.cards[0]) === 11;
      const first: BjHand = { cards: [hand.cards[0], draw(d)], stake: hand.stake, done: aces, fromSplit: true };
      const second: BjHand = { cards: [hand.cards[1], draw(d)], stake: hand.stake, done: aces, fromSplit: true };
      hands = [finish(first), finish(second)];
      break;
    }
  }

  const extraStake = state.cash - cash;
  const wagered = extraStake > 0 ? recordWager(judged, 'blackjack', extraStake, extraStake * CONFIG.BLACKJACK_BASE_EDGE) : judged;
  const next = advance({ ...session, cursor: d.cursor }, { ...round, hands });
  return { ...wagered, cash, venue: next };
}

/** BLACKJACK_RESOLVE：把 DEALER 階段算好的派彩進帳，精神與統計。 */
export function blackjackResolve(state: GameState): GameState {
  const session = state.venue;
  if (session === null || session.kind !== 'blackjack' || session.round === null) return state;
  const round = session.round;
  if (round.stage !== 'DEALER') return state;

  const payout = round.payouts.reduce((sum, p) => sum + p, 0);
  const staked = round.hands.reduce((sum, h) => sum + h.stake, 0);
  const net = payout - staked;
  const natural = round.hands.length === 1 && !round.hands[0].fromSplit && isNatural(round.hands[0].cards) && net > 0;
  const sanityDelta = natural ? CONFIG.BLACKJACK_NATURAL_SANITY : winLossSanity(net);

  const next: BlackjackSession = {
    ...session,
    handsPlayed: session.handsPlayed + 1,
    net: session.net + net,
    round: { ...round, stage: 'DONE' },
  };
  return applyRoundResult({ ...state, cash: state.cash + payout, venue: next }, 'blackjack', net, sanityDelta);
}

// ---------- 刮刮樂 ----------

/** SCRATCH_BUY：扣錢、擲獎、每張精神 -2。獎金在 REVEAL 才進帳。 */
export function scratchBuy(state: GameState, price: number): GameState {
  const session = state.venue;
  if (session === null || session.kind !== 'scratch' || session.ticket !== null) return state;
  const def = ticketDef(price);
  if (def === null || state.cash < price) return state;

  const roll = rollPrize(def, state.rngState);
  const next: ScratchSession = { ...session, ticket: { price, prize: roll.prize } };
  const wagered = recordWager(state, 'scratch', price, price * scratchEdge());
  return {
    ...wagered,
    rngState: roll.rngState,
    cash: state.cash - price,
    sanity: clampSanity(state.sanity - CONFIG.SCRATCH_SANITY_COST),
    venue: next,
  };
}

/** SCRATCH_REVEAL：獎金進帳。中獎 +3，回本或銘謝惠顧精神不變（買票時已扣 2）。 */
export function scratchReveal(state: GameState): GameState {
  const session = state.venue;
  if (session === null || session.kind !== 'scratch' || session.ticket === null) return state;

  const ticket = session.ticket;
  const net = ticket.prize - ticket.price;
  const next: ScratchSession = {
    ...session,
    handsPlayed: session.handsPlayed + 1,
    net: session.net + net,
    ticket: null,
    lastTicket: ticket,
  };
  const sanityDelta = net > 0 ? CONFIG.GAMBLE_WIN_SANITY : 0;
  const jackpot = ticketDef(ticket.price)?.jackpot === ticket.prize;
  const stats = jackpot ? { ...state.stats, scratchJackpots: state.stats.scratchJackpots + 1 } : state.stats;
  return applyRoundResult({ ...state, cash: state.cash + ticket.prize, venue: next, stats }, 'scratch', net, sanityDelta);
}
