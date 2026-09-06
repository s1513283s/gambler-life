import { CONFIG } from '../config';
import type { GameState } from '../types';
import { priceAt } from '../venues/stocks';
import { rngStep } from './rng';

const FLAVOR: readonly string[] = [
  '央行：物價漲幅可控。',
  '名嘴：明天大盤要噴。',
  '某幣圈大佬：這是最後一次上車機會。',
  '運彩公會：本季投注量創新高。',
  '房仲：預售屋沒有不漲的。',
  '週刊：地下錢莊利率飆到日息 5%。',
  '專家：股市長期一定會漲。',
  '網友：刮刮樂中獎率其實很高。',
  '球評：明天那場穩了。',
  '路人：我朋友的朋友上個月靠合約賺了一棟房。',
];

export interface NewsResult {
  text: string;
  rngState: number;
}

/**
 * 睡前一行新聞。一半機率是真的：偷看明天的股價，講對方向。另一半是隨機廢話。
 * 玩家分不出哪半是真的，這就是重點。
 */
export function makeNews(state: GameState): NewsResult {
  let rngState = state.rngState;
  const next = (): number => {
    const step = rngStep(rngState);
    rngState = step.state;
    return step.value;
  };

  const market = state.stockMarket;
  if (market !== null && next() < CONFIG.NEWS_TRUTH_P) {
    const slotIdx = Math.floor(next() * market.length);
    const slot = market[slotIdx];
    const today = priceAt(slot, state.stockDayIndex);
    const tomorrow = priceAt(slot, state.stockDayIndex + 1);
    const up = tomorrow >= today;
    return { text: up ? `傳聞：${slot.name} 明天有大單要進。` : `傳聞：${slot.name} 的大股東最近在賣。`, rngState };
  }
  return { text: FLAVOR[Math.floor(next() * FLAVOR.length)], rngState };
}
