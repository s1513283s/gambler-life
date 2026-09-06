import { CONFIG } from '../config';
import type { CryptoSegment } from '../data/schema';
import type { CryptoExitReason, CryptoPosition, CryptoSession, GameState } from '../types';
import {
  checkCandle,
  cryptoEdgeCost,
  entryPriceWithSlippage,
  isValidOpen,
  notionalOf,
  settle,
  type OpenParams,
} from '../venues/crypto';
import { rngStep } from './rng';
import { applyRoundResult, recordWager } from './venueShared';

function cryptoSession(state: GameState): CryptoSession | null {
  return state.venue?.kind === 'crypto' ? state.venue : null;
}

export function newCryptoSession(): CryptoSession {
  return {
    kind: 'crypto',
    segment: null,
    cursor: 0,
    playing: false,
    roundDone: false,
    position: null,
    handsPlayed: 0,
    net: 0,
    lastResult: null,
    lastMeme: null,
  };
}

/** CRYPTO_NEW_SEGMENT：從沒玩過的切片裡用遊戲 rng 抽一段。全玩過就重置清單。 */
export function cryptoNewSegment(state: GameState, pool: readonly CryptoSegment[]): GameState {
  const session = cryptoSession(state);
  if (session === null || session.position !== null || pool.length === 0) return state;
  if (session.segment !== null && !session.roundDone) return state;

  let used = state.usedCryptoIds;
  let candidates = pool.filter((s) => !used.includes(s.id));
  if (candidates.length === 0) {
    used = [];
    candidates = [...pool];
  }
  const step = rngStep(state.rngState);
  const picked = candidates[Math.floor(step.value * candidates.length)];

  return {
    ...state,
    rngState: step.state,
    usedCryptoIds: [...used, picked.id],
    venue: {
      ...session,
      segment: { id: picked.id, symbol: picked.symbol, candles: picked.candles },
      cursor: 0,
      playing: false,
      roundDone: false,
      lastResult: null,
    },
  };
}

/** CRYPTO_OPEN：扣保證金、記 EV，開始播放。 */
export function cryptoOpen(state: GameState, params: OpenParams): GameState {
  const session = cryptoSession(state);
  if (session === null || session.segment === null || session.position !== null || session.roundDone) return state;
  if (!isValidOpen(params, state.cash, state.tilt)) return state;

  const marketPrice = session.segment.candles[session.cursor][3];
  const position: CryptoPosition = {
    direction: params.direction,
    leverage: params.leverage,
    margin: params.margin,
    entryPrice: entryPriceWithSlippage(marketPrice, params.direction),
    entryIndex: session.cursor,
    takeProfitPct: params.takeProfitPct,
    stopLossPct: params.stopLossPct,
  };
  const notional = notionalOf(position);
  const wagered = recordWager(state, 'crypto', params.margin, cryptoEdgeCost(notional));
  return {
    ...wagered,
    cash: state.cash - params.margin,
    venue: { ...session, position, playing: true },
  };
}

function closePosition(state: GameState, session: CryptoSession, exitPrice: number, exitIndex: number, reason: CryptoExitReason): GameState {
  const position = session.position;
  if (position === null) return state;
  const result = settle(position, exitPrice, reason);

  let sanityDelta = 0;
  if (reason === 'liquidated') sanityDelta = -CONFIG.CRYPTO_LIQ_SANITY;
  else if (result.pnl > 0) sanityDelta = CONFIG.GAMBLE_WIN_SANITY;
  else if (result.pnl < 0) sanityDelta = -CONFIG.GAMBLE_LOSS_SANITY;

  const next: CryptoSession = {
    ...session,
    cursor: exitIndex,
    playing: false,
    roundDone: true,
    position: null,
    handsPlayed: session.handsPlayed + 1,
    net: session.net + result.pnl,
    lastResult: { position, exitPrice, exitIndex, reason, pnl: result.pnl },
  };
  const stats = reason === 'liquidated' ? { ...state.stats, liquidations: state.stats.liquidations + 1 } : state.stats;
  return applyRoundResult({ ...state, cash: state.cash + result.returned, venue: next, stats }, 'crypto', result.pnl, sanityDelta);
}

/** CRYPTO_MEME：土狗幣，即時結算。九成歸零、一成十倍，EV 約 -10%。 */
export function cryptoMeme(state: GameState, rawStake: number): GameState {
  const session = cryptoSession(state);
  if (session === null || session.position !== null) return state;
  const stake = Math.floor(rawStake);
  if (!Number.isFinite(stake) || stake < CONFIG.MEME_MIN || stake > state.cash) return state;
  const step = rngStep(state.rngState);
  const moon = step.value < CONFIG.MEME_MOON_P;
  const payout = moon ? stake * CONFIG.MEME_MULT : 0;
  const net = payout - stake;
  const wagered = recordWager({ ...state, rngState: step.state }, 'crypto', stake, stake * (1 - CONFIG.MEME_MOON_P * CONFIG.MEME_MULT));
  const stats = { ...wagered.stats, memeMoons: wagered.stats.memeMoons + (moon ? 1 : 0), memeRugs: wagered.stats.memeRugs + (moon ? 0 : 1) };
  const next: CryptoSession = { ...session, handsPlayed: session.handsPlayed + 1, net: session.net + net, lastMeme: { stake, moon, payout } };
  return applyRoundResult({ ...wagered, cash: state.cash - stake + payout, venue: next, stats }, 'crypto', net, moon ? CONFIG.GAMBLE_WIN_SANITY : -CONFIG.MEME_RUG_SANITY);
}

/** CRYPTO_TICK：推進一根，依序檢查爆倉 / 停損 / 停利，最後一根自動平倉。 */
export function cryptoTick(state: GameState): GameState {
  const session = cryptoSession(state);
  if (session === null || session.segment === null || session.position === null || !session.playing) return state;

  const candles = session.segment.candles;
  const cursor = session.cursor + 1;
  if (cursor >= candles.length) return state;

  const candle = candles[cursor];
  const check = checkCandle(session.position, candle);
  if (check.reason !== null) return closePosition(state, session, check.price, cursor, check.reason);
  if (cursor === candles.length - 1) return closePosition(state, session, candle[3], cursor, 'expired');
  return { ...state, venue: { ...session, cursor } };
}

/** CRYPTO_CLOSE：以目前這根的收盤價手動平倉。 */
export function cryptoClose(state: GameState): GameState {
  const session = cryptoSession(state);
  if (session === null || session.segment === null || session.position === null) return state;
  const price = session.segment.candles[session.cursor][3];
  return closePosition(state, session, price, session.cursor, 'closed');
}
