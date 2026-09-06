import { CONFIG } from '../config';
import type { GameState } from '../types';

/** 只在 dev 模式呼叫。任何一條失敗代表 reducer 有 bug，直接丟錯讓它浮出來。 */
export function assertInvariants(state: GameState): void {
  const failures: string[] = [];
  const night = state.night;
  const dying = state.phase === 'DEATH' || (night?.step === 'SETTLE' && night.outcome === 'DEATH');

  if (state.day < 1) failures.push(`day=${state.day}`);
  if (state.debt < 0) failures.push(`debt=${state.debt}`);
  if (state.debt > CONFIG.LOAN_CAP * 10) failures.push(`debt runaway ${state.debt}`);
  if (state.sanity < 0 || state.sanity > CONFIG.SANITY_MAX) failures.push(`sanity=${state.sanity}`);
  // 事件（機車壞了）可能把現金打到負，那筆缺口在 SETTLE 步才由借款補上
  if (state.cash < 0 && !dying && state.phase !== 'NIGHT') failures.push(`cash=${state.cash} in phase ${state.phase}`);
  if (state.phase === 'NIGHT' && night === null) failures.push('NIGHT without report');
  if (state.phase !== 'NIGHT' && night !== null) failures.push(`report outside NIGHT (${state.phase})`);
  if (!Number.isInteger(state.cash) || !Number.isInteger(state.debt)) failures.push('non-integer money');
  if (state.phase === 'VENUE' && state.venue === null) failures.push('VENUE without session');
  if (state.phase !== 'VENUE' && state.venue !== null) failures.push(`session outside VENUE (${state.phase})`);
  if (state.venue !== null && 'shoe' in state.venue && state.venue.cursor > state.venue.shoe.length) failures.push('shoe overrun');
  if (state.venue?.kind === 'crypto' && state.venue.segment !== null && state.venue.cursor >= state.venue.segment.candles.length) failures.push('crypto cursor overrun');
  if (state.venue?.kind === 'crypto' && state.venue.playing && state.venue.position === null) failures.push('crypto playing without position');
  if (state.stockPositions.length > 0 && state.stockMarket === null) failures.push('positions without market');
  if (state.stockPositions.some((p) => p.units <= 0 || p.avgCost <= 0)) failures.push('bad stock position');
  if (state.phase === 'EVENING' && state.nbaBets.length === 0 && state.nbaResults.length === 0) failures.push('EVENING with nothing to settle');
  if (state.nbaBets.length > 0 && state.nbaToday === null) failures.push('bets without schedule');
  if (state.expenseMultiplier < 1) failures.push(`expenseMultiplier=${state.expenseMultiplier}`);

  if (failures.length > 0) {
    throw new Error(`GameState invariant violated: ${failures.join('; ')}`);
  }
}
