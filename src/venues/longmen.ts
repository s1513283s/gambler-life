import type { Card } from '../types';
import { rankOf } from './cards';

/** A = 1 … K = 13 */
export function longmenRank(card: Card): number {
  return rankOf(card) + 1;
}

/** 門柱之間至少要有一個點數才成局，否則重發 */
export function isPlayable(posts: readonly [Card, Card]): boolean {
  return Math.abs(longmenRank(posts[0]) - longmenRank(posts[1])) >= 2;
}

export type LongmenOutcome = 'hit' | 'post' | 'miss';

export function judge(posts: readonly [Card, Card], third: Card): LongmenOutcome {
  const a = longmenRank(posts[0]);
  const b = longmenRank(posts[1]);
  const t = longmenRank(third);
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (t === lo || t === hi) return 'post';
  if (t > lo && t < hi) return 'hit';
  return 'miss';
}

/** 命中賠 1:1；撞柱賠雙倍（多扣一份本金）；沒中輸本金。回傳「相對於已扣本金的現金變動」。 */
export function longmenDelta(outcome: LongmenOutcome, stake: number, postMultiplier: number): number {
  switch (outcome) {
    case 'hit':
      return stake * 2;
    case 'post':
      return -stake * (postMultiplier - 1);
    case 'miss':
      return 0;
  }
}

/** 中門機率，給 UI 顯示 */
export function hitChance(posts: readonly [Card, Card]): number {
  const a = longmenRank(posts[0]);
  const b = longmenRank(posts[1]);
  const inside = Math.abs(a - b) - 1;
  return (inside * 4) / 52;
}
