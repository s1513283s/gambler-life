import { CONFIG } from '../config';
import type { GameState, LongmenSession, NiuniuSession, SicboBet, SicboSession } from '../types';
import { isValidStake } from '../venues/betting';
import { newShoe } from '../venues/cards';
import { hitChance, isPlayable, judge, longmenDelta } from '../venues/longmen';
import { makeHand, multiplierOf, needsReshuffle, playerWins } from '../venues/niuniu';
import { isValidSicboBet, rollDice, sicboEdge, sicboPayout } from '../venues/sicbo';
import { applyRoundResult, recordWager, winLossSanity } from './venueShared';

export function newSicboSession(): SicboSession {
  return { kind: 'sicbo', handsPlayed: 0, net: 0, pending: null, lastResult: null };
}

export function newNiuniuSession(rngState: number): { session: NiuniuSession; rngState: number } {
  const shoe = newShoe(CONFIG.NIUNIU_DECKS, rngState);
  return {
    session: { kind: 'niuniu', shoe: shoe.cards, cursor: 0, handsPlayed: 0, net: 0, pending: null, lastResult: null },
    rngState: shoe.rngState,
  };
}

export function newLongmenSession(rngState: number): { session: LongmenSession; rngState: number } {
  const shoe = newShoe(CONFIG.LONGMEN_DECKS, rngState);
  return {
    session: { kind: 'longmen', shoe: shoe.cards, cursor: 0, handsPlayed: 0, net: 0, round: null },
    rngState: shoe.rngState,
  };
}

// ---------- 骰寶 ----------

export function sicboBet(state: GameState, bet: SicboBet, stake: number): GameState {
  const session = state.venue;
  if (session === null || session.kind !== 'sicbo' || session.pending !== null) return state;
  if (!isValidSicboBet(bet) || !isValidStake('sicbo', stake, state.cash, state.tilt)) return state;
  const roll = rollDice(state.rngState);
  const wagered = recordWager(state, 'sicbo', stake, stake * sicboEdge(bet));
  return {
    ...wagered,
    rngState: roll.rngState,
    cash: state.cash - stake,
    venue: { ...session, pending: { bet, stake, dice: roll.dice } },
  };
}

export function sicboResolve(state: GameState): GameState {
  const session = state.venue;
  if (session === null || session.kind !== 'sicbo' || session.pending === null) return state;
  const pending = session.pending;
  const payout = sicboPayout(pending.bet, pending.stake, pending.dice);
  const net = payout - pending.stake;
  const next: SicboSession = {
    ...session,
    handsPlayed: session.handsPlayed + 1,
    net: session.net + net,
    pending: null,
    lastResult: { ...pending, payout },
  };
  return applyRoundResult({ ...state, cash: state.cash + payout, venue: next }, 'sicbo', net, winLossSanity(net));
}

// ---------- 妞妞 ----------

/** 輸的時候最多賠三倍，所以注碼上限是現金的三分之一 */
export function niuniuMaxStake(cash: number): number {
  return Math.floor(cash / 3);
}

export function niuniuBet(state: GameState, stake: number): GameState {
  const session = state.venue;
  if (session === null || session.kind !== 'niuniu' || session.pending !== null) return state;
  if (!isValidStake('niuniu', stake, state.cash, state.tilt) || stake > niuniuMaxStake(state.cash)) return state;

  let shoe = session.shoe;
  let cursor = session.cursor;
  let rngState = state.rngState;
  if (needsReshuffle(shoe.length, cursor, CONFIG.NIUNIU_CUT_CARD)) {
    const fresh = newShoe(CONFIG.NIUNIU_DECKS, rngState);
    shoe = fresh.cards;
    cursor = 0;
    rngState = fresh.rngState;
  }
  const player = makeHand(shoe.slice(cursor, cursor + 5));
  const banker = makeHand(shoe.slice(cursor + 5, cursor + 10));
  const wagered = recordWager(state, 'niuniu', stake, stake * CONFIG.NIUNIU_EDGE);
  return {
    ...wagered,
    rngState,
    cash: state.cash - stake,
    venue: { ...session, shoe, cursor: cursor + 10, pending: { stake, player, banker } },
  };
}

export function niuniuResolve(state: GameState): GameState {
  const session = state.venue;
  if (session === null || session.kind !== 'niuniu' || session.pending === null) return state;
  const p = session.pending;
  const wins = playerWins(p.player, p.banker);
  const multiplier = multiplierOf(wins ? p.player.niu : p.banker.niu);
  const net = wins ? p.stake * multiplier : -p.stake * multiplier;
  // 本金已扣；贏拿回本金加倍數，輸則再扣超過本金的部分
  const cashDelta = wins ? p.stake + net : p.stake + net;
  const next: NiuniuSession = {
    ...session,
    handsPlayed: session.handsPlayed + 1,
    net: session.net + net,
    pending: null,
    lastResult: { ...p, payout: Math.max(0, p.stake + net), multiplier, playerWins: wins },
  };
  return applyRoundResult({ ...state, cash: state.cash + cashDelta, venue: next }, 'niuniu', net, winLossSanity(net));
}

// ---------- 射龍門 ----------

/** 發兩張門柱；不成局就重發到成局為止，牌不夠就重洗 */
export function longmenDeal(state: GameState): GameState {
  const session = state.venue;
  if (session === null || session.kind !== 'longmen') return state;
  if (session.round !== null && session.round.third === null) return state;

  let shoe = session.shoe;
  let cursor = session.cursor;
  let rngState = state.rngState;
  for (let guard = 0; guard < 50; guard++) {
    if (needsReshuffle(shoe.length, cursor, CONFIG.LONGMEN_CUT_CARD)) {
      const fresh = newShoe(CONFIG.LONGMEN_DECKS, rngState);
      shoe = fresh.cards;
      cursor = 0;
      rngState = fresh.rngState;
    }
    const posts: [number, number] = [shoe[cursor], shoe[cursor + 1]];
    cursor += 2;
    if (isPlayable(posts)) {
      return {
        ...state,
        rngState,
        venue: { ...session, shoe, cursor, round: { posts, stake: null, third: null, payout: 0, outcome: null } },
      };
    }
  }
  return state;
}

/** 撞柱要賠雙倍，注碼上限是現金的一半 */
export function longmenMaxStake(cash: number): number {
  return Math.floor(cash / CONFIG.LONGMEN_POST_MULTIPLIER);
}

export function longmenBet(state: GameState, stake: number): GameState {
  const session = state.venue;
  if (session === null || session.kind !== 'longmen' || session.round === null) return state;
  const round = session.round;
  if (round.stake !== null) return state;
  if (!isValidStake('longmen', stake, state.cash, state.tilt) || stake > longmenMaxStake(state.cash)) return state;

  let shoe = session.shoe;
  let cursor = session.cursor;
  let rngState = state.rngState;
  if (cursor >= shoe.length) {
    const fresh = newShoe(CONFIG.LONGMEN_DECKS, rngState);
    shoe = fresh.cards;
    cursor = 0;
    rngState = fresh.rngState;
  }
  const third = shoe[cursor];
  const outcome = judge(round.posts, third);
  // EV 記帳：依這一局的真實中門機率算（1:1 賠率下的期望）
  const p = hitChance(round.posts);
  const ev = Math.max(0, stake * (1 - 2 * p) + stake * (8 / 52) * (CONFIG.LONGMEN_POST_MULTIPLIER - 1));
  const wagered = recordWager(state, 'longmen', stake, Math.min(ev, stake * CONFIG.LONGMEN_EDGE * 10));
  return {
    ...wagered,
    rngState,
    cash: state.cash - stake,
    venue: {
      ...session,
      shoe,
      cursor: cursor + 1,
      round: { ...round, stake, third, outcome, payout: stake + longmenDelta(outcome, stake, CONFIG.LONGMEN_POST_MULTIPLIER) },
    },
  };
}

export function longmenResolve(state: GameState): GameState {
  const session = state.venue;
  if (session === null || session.kind !== 'longmen' || session.round === null) return state;
  const round = session.round;
  if (round.stake === null || round.outcome === null) return state;
  const delta = longmenDelta(round.outcome, round.stake, CONFIG.LONGMEN_POST_MULTIPLIER);
  const net = delta - round.stake;
  const next: LongmenSession = {
    ...session,
    handsPlayed: session.handsPlayed + 1,
    net: session.net + net,
    round: null,
  };
  return applyRoundResult({ ...state, cash: state.cash + delta, venue: next }, 'longmen', net, winLossSanity(net));
}
