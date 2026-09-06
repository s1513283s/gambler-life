import { CONFIG } from '../config';
import type { EventDef, EventId, GameState } from '../types';
import { clampSanity } from './economy';
import { rngStep } from './rng';

export const EVENT_TEXT: Record<EventId, string> = {
  nothing: '無事發生。',
  bike_broke: '機車壞了，修車花了 2,000。',
  friend_repays: '朋友終於把欠你的 1,500 還了。',
  overtime_pay: '老闆多給了 400 加班費。',
  rent_hike: '房東說下個月起房租漲 10%。',
  found_money: '路上撿到 500。',
  sick: '身體不舒服，明天沒辦法打工。',
  insider_tip: '朋友傳來訊息：明天有一場「內線」。',
};

const TABLE: readonly EventDef[] = CONFIG.EVENT_TABLE;
const TOTAL_WEIGHT = TABLE.reduce((sum, e) => sum + e.weight, 0);

export interface EventRoll {
  event: EventDef;
  rngState: number;
}

/** 依權重擲一個事件。requiresWork 的事件在沒打工的日子降級為無事發生。 */
export function rollEvent(rngState: number, workedToday: boolean): EventRoll {
  const step = rngStep(rngState);
  let cursor = step.value * TOTAL_WEIGHT;
  let picked: EventDef = TABLE[0];
  for (const def of TABLE) {
    cursor -= def.weight;
    if (cursor < 0) {
      picked = def;
      break;
    }
  }
  if (picked.requiresWork && !workedToday) picked = TABLE[0];
  return { event: picked, rngState: step.state };
}

/** 套用事件的立即效果。房租調漲只改 multiplier，明天翻日時才反映在 dailyExpense。 */
export function applyEvent(state: GameState, event: EventDef): GameState {
  return {
    ...state,
    cash: state.cash + (event.cash ?? 0),
    sanity: clampSanity(state.sanity + (event.sanity ?? 0)),
    expenseMultiplier: state.expenseMultiplier * (event.expenseMultiplier ?? 1),
    workBlockedUntilDay: event.blocksWorkTomorrow ? state.day + 1 : state.workBlockedUntilDay,
    insiderTipDay: event.insiderTip ? state.day + 1 : state.insiderTipDay,
  };
}
