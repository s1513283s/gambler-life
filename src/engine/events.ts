import { CONFIG } from '../config';
import type { EventDef, EventEffect, EventId, GameState } from '../types';
import { clampSanity } from './economy';
import { rngStep } from './rng';

/**
 * 事件表。weight > 0 的會進隨機抽選；weight 0 只能被 schedule 觸發。
 * 「無事發生」的權重會被選擇題事件分掉，總權重維持 100。
 */
export const EVENTS: readonly EventDef[] = [
  { id: 'nothing', weight: 60 - CONFIG.CHOICE_EVENT_WEIGHT, text: '無事發生。' },
  { id: 'bike_broke', weight: 8, text: '機車壞了，修車花了 2,000。', cash: -2000 },
  { id: 'friend_repays', weight: 6, text: '朋友終於把欠你的 1,500 還了。', cash: 1500 },
  { id: 'overtime_pay', weight: 6, text: '老闆多給了 400 加班費。', cash: 400, requiresWork: true },
  { id: 'rent_hike', weight: 5, text: '房東說下個月起房租漲 10%。', expenseMultiplier: 1.1 },
  { id: 'found_money', weight: 5, text: '路上撿到 500。', cash: 500 },
  { id: 'sick', weight: 5, text: '身體不舒服，明天沒辦法打工。', sanity: -10, blocksWorkTomorrow: true },
  { id: 'insider_tip', weight: 5, text: '朋友傳來訊息：明天有一場「內線」。', insiderTip: true },

  // ---- 房東 ----
  {
    id: 'landlord_raise',
    weight: 3,
    text: '房東敲門：「下個月漲三成，不然就搬。」',
    choices: [
      { label: '付 8,000 搬到更小的地方', effects: { cash: -8000, sanity: -5 } },
      { label: '接受，房租漲 20%', effects: { expenseMultiplier: 1.2 } },
      { label: '拖著不理', effects: { sanity: -5, schedule: { id: 'landlord_return', inDays: 3 } } },
    ],
  },
  {
    id: 'landlord_return',
    weight: 0,
    text: '房東帶著兒子來了。「上次說的事，現在漲四成，不然今天就走。」',
    choices: [
      { label: '認了，房租漲 40%', effects: { expenseMultiplier: 1.4 } },
      { label: '付 15,000 搬走', effects: { cash: -15000, sanity: -10 } },
    ],
  },

  // ---- 阿明 ----
  {
    id: 'friend_venture',
    weight: 3,
    condition: 'hasFriend',
    text: '阿明：「我要開個小局，你出一萬，三天後分你。」',
    choices: [
      { label: '出一萬', effects: { cash: -10000, friend: 1, schedule: { id: 'friend_venture_result', inDays: 3 } } },
      { label: '不了', effects: { friend: -1 } },
    ],
  },
  {
    id: 'friend_venture_result',
    weight: 0,
    text: '阿明的局開完了。',
    roll: [
      { p: 0.5, text: '阿明：「賺翻了！這是你的兩萬五。」', effects: { cash: 25000, friend: 1, sanity: 10 } },
      { p: 0.3, text: '阿明：「被抓了，錢全沒了。」', effects: { sanity: -10 } },
      { p: 0.2, text: '條子上門。阿明把你供出去了，你被關了兩天。', effects: { sanity: -20, blocksWorkTomorrow: true, friend: -2 } },
    ],
  },
  {
    id: 'friend_borrow',
    weight: 3,
    condition: 'hasFriend',
    text: '阿明：「借我五千，五天還你七千。」',
    choices: [
      { label: '借他', effects: { cash: -5000, schedule: { id: 'friend_borrow_result', inDays: 5 } } },
      { label: '沒錢', effects: { friend: -1 } },
    ],
  },
  {
    id: 'friend_borrow_result',
    weight: 0,
    text: '五天到了。',
    roll: [
      { p: 0.6, text: '阿明真的拿了七千來。', effects: { cash: 7000, friend: 1 } },
      { p: 0.4, text: '阿明電話不通。他跑路了。', effects: { friendGone: true, sanity: -10 } },
    ],
  },
  {
    id: 'friend_tip_meme',
    weight: 2,
    condition: 'hasFriend',
    text: '阿明：「有一顆幣明天要噴，我內部消息。」（幣圈場子裡有土狗幣）',
  },

  // ---- 家人 ----
  {
    id: 'family_birthday',
    weight: 3,
    condition: 'hasFamily',
    text: '媽生日。',
    choices: [
      { label: '包三千回家吃飯', effects: { cash: -3000, family: 1, sanity: 10 } },
      { label: '傳個訊息就好', effects: { family: -1 } },
    ],
  },
  {
    id: 'family_discovers',
    weight: 4,
    condition: 'hasFamilyNoPromise',
    text: '家人發現你在賭。「你答應我，不要再去了。」',
    choices: [
      { label: '答應（五天內進場子她會知道）', effects: { promise: true, family: 1, sanity: 5 } },
      { label: '否認', effects: { family: -1, sanity: -5 } },
    ],
  },
  {
    id: 'family_medical',
    weight: 2,
    condition: 'hasFamily',
    text: '爸住院，要兩萬。',
    choices: [
      { label: '拿兩萬出來', effects: { cash: -20000, family: 2, sanity: 5 } },
      { label: '說手頭緊', effects: { family: -1, sanity: -10 } },
    ],
  },
  { id: 'family_leaves', weight: 0, text: '家人搬走了，留了一張紙條。你一個人了。', familyGone: true, sanity: -20 },
  { id: 'family_promise_broken', weight: 0, text: '家人知道你又去了。她沒有再說什麼。', family: -2, sanity: -15 },
];

const BY_ID = new Map(EVENTS.map((e) => [e.id, e]));

export function eventDef(id: EventId): EventDef {
  const def = BY_ID.get(id);
  if (def === undefined) throw new Error(`unknown event ${id}`);
  return def;
}

function conditionOk(def: EventDef, state: GameState): boolean {
  switch (def.condition) {
    case 'hasFriend':
      return !state.relations.friendGone;
    case 'hasFamily':
      return !state.relations.familyGone;
    case 'gambledSome':
      return state.stats.daysGambled >= 3;
    case 'hasFamilyNoPromise':
      return !state.relations.familyGone && state.promiseUntilDay < state.day && state.stats.daysGambled >= 3;
    default:
      return true;
  }
}

export interface EventPick {
  event: EventDef;
  rngState: number;
}

/**
 * 今晚的事件：排程到期的優先；否則依權重抽，條件不符的權重歸零。
 * requiresWork 的事件在沒打工的日子降級為無事發生。
 */
export function pickEvent(state: GameState, workedToday: boolean): EventPick {
  const due = state.scheduled.find((s) => s.day <= state.day);
  if (due !== undefined) return { event: eventDef(due.id), rngState: state.rngState };

  const candidates = EVENTS.filter((e) => e.weight > 0 && conditionOk(e, state));
  const total = candidates.reduce((sum, e) => sum + e.weight, 0);
  const step = rngStep(state.rngState);
  let cursor = step.value * total;
  let picked = candidates[0];
  for (const def of candidates) {
    cursor -= def.weight;
    if (cursor < 0) {
      picked = def;
      break;
    }
  }
  if (picked.requiresWork && !workedToday) picked = eventDef('nothing');
  return { event: picked, rngState: step.state };
}

export interface Applied {
  state: GameState;
  text: string | null; // 機率分支的結果文字
}

/** 套用一個效果包。roll 分支用遊戲 rng 決定，並遞迴套用該分支的效果。 */
export function applyEffect(state: GameState, effect: EventEffect): Applied {
  let next: GameState = {
    ...state,
    cash: state.cash + (effect.cash ?? 0),
    sanity: clampSanity(state.sanity + (effect.sanity ?? 0)),
    expenseMultiplier: state.expenseMultiplier * (effect.expenseMultiplier ?? 1),
    workBlockedUntilDay: effect.blocksWorkTomorrow ? Math.max(state.workBlockedUntilDay, state.day + 1) : state.workBlockedUntilDay,
    insiderTipDay: effect.insiderTip ? state.day + 1 : state.insiderTipDay,
    promiseUntilDay: effect.promise ? state.day + CONFIG.PROMISE_DAYS : state.promiseUntilDay,
    relations: {
      family: state.relations.family + (effect.family ?? 0),
      friend: state.relations.friend + (effect.friend ?? 0),
      familyGone: state.relations.familyGone || effect.familyGone === true,
      friendGone: state.relations.friendGone || effect.friendGone === true,
    },
    scheduled: effect.schedule ? [...state.scheduled, { day: state.day + effect.schedule.inDays, id: effect.schedule.id }] : state.scheduled,
  };

  let text: string | null = null;
  if (effect.roll && effect.roll.length > 0) {
    const step = rngStep(next.rngState);
    next = { ...next, rngState: step.state };
    let cursor = step.value;
    let branch = effect.roll[effect.roll.length - 1];
    for (const b of effect.roll) {
      if (cursor < b.p) {
        branch = b;
        break;
      }
      cursor -= b.p;
    }
    const inner = applyEffect(next, branch.effects);
    next = inner.state;
    text = branch.text;
  }

  // 家人好感掉到門檻就排「離開」事件，只排一次
  if (!next.relations.familyGone && next.relations.family <= CONFIG.RELATION_LEAVE_THRESHOLD && !next.scheduled.some((s) => s.id === 'family_leaves')) {
    next = { ...next, scheduled: [...next.scheduled, { day: next.day + 1, id: 'family_leaves' }] };
  }
  return { state: next, text };
}

/** 事件被觸發時：從排程移除；沒有選項的直接套用效果。 */
export function triggerEvent(state: GameState, def: EventDef): Applied {
  const cleared: GameState = { ...state, scheduled: state.scheduled.filter((s) => !(s.id === def.id && s.day <= state.day)) };
  if (def.choices && def.choices.length > 0) return { state: cleared, text: null };
  return applyEffect(cleared, def);
}

export function chooseEvent(state: GameState, def: EventDef, index: number): Applied | null {
  const choice = def.choices?.[index];
  if (choice === undefined) return null;
  return applyEffect(state, choice.effects);
}

/** 進場子時：若答應過家人，安排明晚的「她知道了」 */
export function breakPromiseIfAny(state: GameState): GameState {
  if (state.promiseUntilDay < state.day) return state;
  if (state.scheduled.some((s) => s.id === 'family_promise_broken')) return state;
  return { ...state, promiseUntilDay: 0, scheduled: [...state.scheduled, { day: state.day, id: 'family_promise_broken' }] };
}

/** 給舊畫面與測試用的文字表 */
export const EVENT_TEXT: Record<EventId, string> = Object.fromEntries(EVENTS.map((e) => [e.id, e.text])) as Record<EventId, string>;
