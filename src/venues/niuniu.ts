import type { Card, NiuHand } from '../types';
import { rankOf } from './cards';

/** A = 1，2-9 面值，10/J/Q/K = 10 */
export function niuValue(card: Card): number {
  const rank = rankOf(card);
  if (rank === 0) return 1;
  return Math.min(rank + 1, 10);
}

/**
 * 五張裡任三張加總是 10 的倍數就有牛，牛值 = 另外兩張加總 mod 10（0 = 牛牛 = 10）。
 * 沒有任何三張湊成十的倍數 = 無牛 = 0。
 */
export function niuOf(cards: readonly Card[]): number {
  const v = cards.map(niuValue);
  const total = v.reduce((s, x) => s + x, 0);
  for (let i = 0; i < 5; i++) {
    for (let j = i + 1; j < 5; j++) {
      for (let k = j + 1; k < 5; k++) {
        if ((v[i] + v[j] + v[k]) % 10 === 0) {
          const rest = (total - v[i] - v[j] - v[k]) % 10;
          return rest === 0 ? 10 : rest;
        }
      }
    }
  }
  return 0;
}

export function makeHand(cards: Card[]): NiuHand {
  return { cards, niu: niuOf(cards) };
}

/** 牛牛 3 倍、牛七到牛九 2 倍、其餘 1 倍 */
export function multiplierOf(niu: number): number {
  if (niu === 10) return 3;
  if (niu >= 7) return 2;
  return 1;
}

/** 比大小用的單張分數：點數（K 最大、A 最小）優先，再比花色（黑桃 > 紅心 > 方塊 > 梅花） */
function cardStrength(card: Card): number {
  const rank = rankOf(card) === 0 ? 1 : rankOf(card) + 1; // A=1 … K=13
  const suit = 3 - Math.floor(card / 13); // 黑桃 3、紅心 2、方塊 1、梅花 0
  return rank * 4 + suit;
}

function highCard(hand: NiuHand): number {
  return Math.max(...hand.cards.map(cardStrength));
}

/** 牛值大的贏；牛值相同比最大單張；連單張都一樣（多副牌才會）歸莊，這是莊家的優勢 */
export function playerWins(player: NiuHand, banker: NiuHand): boolean {
  if (player.niu !== banker.niu) return player.niu > banker.niu;
  return highCard(player) > highCard(banker);
}

export function niuLabel(niu: number): string {
  if (niu === 0) return '無牛';
  if (niu === 10) return '牛牛';
  return `牛${niu}`;
}

export function needsReshuffle(shoeLength: number, cursor: number, cutCard: number): boolean {
  return shoeLength - cursor < cutCard;
}
