import { CONFIG } from '../config';
import type { GameState, Lend, PurchaseId } from '../types';
import { clampSanity } from './economy';
import { rngStep } from './rng';
import { isUnlocked } from './unlocks';
import { withPeak } from './venueShared';

export interface PurchaseDef {
  id: PurchaseId;
  name: string;
  price: number;
  blurb: string;
}

export const PURCHASES: readonly PurchaseDef[] = [
  { id: 'house', name: '買房', price: CONFIG.HOUSE_PRICE, blurb: `不用再付房租，開銷成長從 ${CONFIG.EXPENSE_GROWTH * 100}% 降到 ${CONFIG.HOUSE_EXPENSE_GROWTH * 100}%。` },
  { id: 'buyout', name: '買斷阿龍', price: CONFIG.BUYOUT_PRICE, blurb: '債務一筆勾銷，他永遠消失。以後也借不到了。' },
  { id: 'family', name: '給家裡錢', price: CONFIG.FAMILY_GIFT, blurb: `精神 +${CONFIG.FAMILY_SANITY}，死亡卡片多一個「孝子」。` },
  ...CONFIG.SHOP_ITEMS.map<PurchaseDef>((i) => ({ id: i.id, name: i.name, price: i.price, blurb: `精神 +${i.sanity}，印在死亡卡片上。` })),
];

export function purchaseDef(id: PurchaseId): PurchaseDef {
  const def = PURCHASES.find((p) => p.id === id);
  if (def === undefined) throw new Error(`unknown purchase ${id}`);
  return def;
}

/** BUY_ITEM：每樣只能買一次，現金要夠。買斷阿龍另外要求債務一併清掉（價格已含）。 */
export function buyItem(state: GameState, id: PurchaseId): GameState {
  if (state.purchases.includes(id)) return state;
  const def = purchaseDef(id);
  if (state.cash < def.price) return state;

  let next: GameState = { ...state, cash: state.cash - def.price, purchases: [...state.purchases, id] };
  switch (id) {
    case 'house':
      next = { ...next, expenseGrowth: CONFIG.HOUSE_EXPENSE_GROWTH };
      break;
    case 'buyout':
      next = { ...next, debt: 0, daysMaxedOut: 0, loanSharkGone: true };
      break;
    case 'family':
      next = { ...next, sanity: clampSanity(next.sanity + CONFIG.FAMILY_SANITY) };
      break;
    default: {
      const item = CONFIG.SHOP_ITEMS.find((i) => i.id === id);
      if (item !== undefined) next = { ...next, sanity: clampSanity(next.sanity + item.sanity) };
    }
  }
  return withPeak(next);
}

// ---------- 放高利貸 ----------

export function lend(state: GameState, rawAmount: number): GameState {
  if (!isUnlocked(state, 'lending')) return state;
  const amount = Math.floor(rawAmount);
  if (!Number.isFinite(amount) || amount < CONFIG.LEND_MIN || amount > state.cash) return state;
  const entry: Lend = { principal: amount, startDay: state.day };
  const byVenue = { ...state.stats.byVenue };
  byVenue.lending = { ...byVenue.lending, wagered: byVenue.lending.wagered + amount, sessions: byVenue.lending.sessions + 1 };
  return { ...state, cash: state.cash - amount, lends: [...state.lends, entry], stats: { ...state.stats, byVenue } };
}

export function collectLend(state: GameState, index: number): GameState {
  const entry = state.lends[index];
  if (entry === undefined) return state;
  return withPeak({ ...state, cash: state.cash + entry.principal, lends: state.lends.filter((_, i) => i !== index) });
}

// ---------- 代操 ----------

export function acceptManage(state: GameState): GameState {
  if (!isUnlocked(state, 'managing') || state.managed !== null) return state;
  const byVenue = { ...state.stats.byVenue };
  byVenue.managing = { ...byVenue.managing, sessions: byVenue.managing.sessions + 1 };
  return {
    ...state,
    cash: state.cash + CONFIG.MANAGE_PRINCIPAL,
    managed: { principal: CONFIG.MANAGE_PRINCIPAL, cashAtStart: state.cash, dueDay: state.day + CONFIG.MANAGE_DAYS },
    stats: { ...state.stats, byVenue },
  };
}

// ---------- 預售屋 ----------

export function buyPresale(state: GameState, rawAmount: number): GameState {
  if (!isUnlocked(state, 'presale') || state.property !== null) return state;
  const amount = Math.floor(rawAmount);
  if (!Number.isFinite(amount) || amount < CONFIG.PRESALE_MIN || amount > state.cash) return state;
  const byVenue = { ...state.stats.byVenue };
  byVenue.presale = { ...byVenue.presale, wagered: byVenue.presale.wagered + amount, sessions: byVenue.presale.sessions + 1 };
  return {
    ...state,
    cash: state.cash - amount,
    property: { downPayment: amount, equity: amount, startDay: state.day, dueDay: state.day + CONFIG.PRESALE_DAYS },
    stats: { ...state.stats, byVenue },
  };
}

export function sellPresale(state: GameState): GameState {
  const p = state.property;
  if (p === null) return state;
  const net = p.equity - p.downPayment;
  const byVenue = { ...state.stats.byVenue };
  byVenue.presale = { ...byVenue.presale, net: byVenue.presale.net + net };
  return withPeak({ ...state, cash: state.cash + p.equity, property: null, stats: { ...state.stats, byVenue } });
}

// ---------- 夜晚結算 ----------

export interface RichNight {
  state: GameState;
  lendInterest: number;
  lendDefaulted: number;
  propertyChange: number;
  propertyMarginCall: boolean;
  managedSettled: { profit: number; paid: number } | null;
  clientDeath: boolean;
}

/** 入夜時處理三種部位：高利貸滾息或跑路、預售屋漲跌或斷頭、代操到期結算。 */
export function richNight(state: GameState): RichNight {
  let rngState = state.rngState;
  const next = (): number => {
    const step = rngStep(rngState);
    rngState = step.state;
    return step.value;
  };

  let lendInterest = 0;
  let lendDefaulted = 0;
  const lends: Lend[] = [];
  for (const l of state.lends) {
    if (next() < CONFIG.LEND_DEFAULT_RATE) {
      lendDefaulted += l.principal;
      continue;
    }
    const interest = Math.round(l.principal * CONFIG.LEND_RATE);
    lendInterest += interest;
    lends.push({ ...l, principal: l.principal + interest });
  }

  let property = state.property;
  let propertyChange = 0;
  let propertyMarginCall = false;
  let cash = state.cash;
  const byVenue = { ...state.stats.byVenue };
  if (property !== null) {
    const magnitude = CONFIG.PRESALE_MOVE_MIN + next() * (CONFIG.PRESALE_MOVE_MAX - CONFIG.PRESALE_MOVE_MIN);
    const direction = next() < 0.5 ? -1 : 1;
    propertyChange = Math.round(property.equity * magnitude * direction);
    const equity = property.equity + propertyChange;
    if (equity <= property.downPayment * CONFIG.PRESALE_MARGIN_CALL) {
      propertyMarginCall = true;
      byVenue.presale = { ...byVenue.presale, net: byVenue.presale.net - property.downPayment };
      property = null;
    } else if (state.day >= property.dueDay) {
      cash += equity;
      byVenue.presale = { ...byVenue.presale, net: byVenue.presale.net + equity - property.downPayment };
      property = null;
    } else {
      property = { ...property, equity };
    }
  }

  let managed = state.managed;
  let managedSettled: RichNight['managedSettled'] = null;
  let clientDeath = false;
  if (managed !== null && state.day >= managed.dueDay) {
    const gain = cash - managed.cashAtStart - managed.principal; // 接錢後淨賺
    const profit = Math.max(0, gain);
    const paid = managed.principal + Math.round(profit * (1 - CONFIG.MANAGE_SHARE));
    if (cash < managed.principal) {
      clientDeath = true;
    } else {
      cash -= paid;
    }
    byVenue.managing = { ...byVenue.managing, net: byVenue.managing.net + Math.round(profit * CONFIG.MANAGE_SHARE) };
    managedSettled = { profit, paid };
    managed = null;
  }

  const byLending = { ...byVenue.lending, net: byVenue.lending.net + lendInterest - lendDefaulted };
  return {
    state: { ...state, rngState, cash, lends, property, managed, stats: { ...state.stats, byVenue: { ...byVenue, lending: byLending } } },
    lendInterest,
    lendDefaulted,
    propertyChange,
    propertyMarginCall,
    managedSettled,
    clientDeath,
  };
}

/** 三種部位的帳面價值，算淨值用 */
export function richPositionsValue(state: Pick<GameState, 'lends' | 'property' | 'managed'>): number {
  const lent = state.lends.reduce((s, l) => s + l.principal, 0);
  const equity = state.property?.equity ?? 0;
  const owed = state.managed?.principal ?? 0;
  return lent + equity - owed;
}
