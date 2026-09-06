import { CONFIG } from '../config';
import type { BaccaratHand, BaccaratSide, Card } from '../types';
import { rankOf } from './cards';

/** A = 1，2-9 面值，10/J/Q/K = 0 */
export function baccaratValue(card: Card): number {
  const rank = rankOf(card);
  if (rank === 0) return 1;
  if (rank >= 9) return 0;
  return rank + 1;
}

export function handTotal(cards: readonly Card[]): number {
  return cards.reduce((sum, c) => sum + baccaratValue(c), 0) % 10;
}

/** 閒家補牌後，莊家是否補第三張。 */
function bankerDraws(bankerTotal: number, playerThird: number | null): boolean {
  if (playerThird === null) return bankerTotal <= 5;
  switch (bankerTotal) {
    case 0:
    case 1:
    case 2:
      return true;
    case 3:
      return playerThird !== 8;
    case 4:
      return playerThird >= 2 && playerThird <= 7;
    case 5:
      return playerThird >= 4 && playerThird <= 7;
    case 6:
      return playerThird === 6 || playerThird === 7;
    default:
      return false;
  }
}

export interface DealResult {
  hand: BaccaratHand;
  cursor: number;
}

/** 一局最多用 6 張牌。呼叫前請確認牌靴夠用（見 needsReshuffle）。 */
export function dealHand(shoe: readonly Card[], cursor: number): DealResult {
  let next = cursor;
  const draw = (): Card => shoe[next++];

  const player: Card[] = [draw()];
  const banker: Card[] = [draw()];
  player.push(draw());
  banker.push(draw());

  let playerTotal = handTotal(player);
  let bankerTotal = handTotal(banker);
  const natural = playerTotal >= 8 || bankerTotal >= 8;

  if (!natural) {
    let playerThird: number | null = null;
    if (playerTotal <= 5) {
      const card = draw();
      player.push(card);
      playerThird = baccaratValue(card);
      playerTotal = handTotal(player);
    }
    if (bankerDraws(bankerTotal, playerThird)) {
      banker.push(draw());
      bankerTotal = handTotal(banker);
    }
  }

  const outcome: BaccaratSide =
    playerTotal === bankerTotal ? 'tie' : playerTotal > bankerTotal ? 'player' : 'banker';

  return { hand: { player, banker, playerTotal, bankerTotal, outcome }, cursor: next };
}

export function needsReshuffle(shoeLength: number, cursor: number): boolean {
  return shoeLength - cursor < CONFIG.BACCARAT_CUT_CARD;
}

/** 退還給玩家的總額（含本金）。和局時押莊押閒退本金。 */
export function payoutFor(side: BaccaratSide, stake: number, outcome: BaccaratSide, commission: number = CONFIG.BACCARAT_COMMISSION): number {
  if (outcome === 'tie') {
    if (side === 'tie') return stake + stake * CONFIG.BACCARAT_TIE_PAYOUT;
    return stake;
  }
  if (side !== outcome) return 0;
  if (side === 'banker') return stake + Math.floor(stake * (1 - commission));
  return stake * 2;
}

