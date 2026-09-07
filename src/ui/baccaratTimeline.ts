import { CONFIG } from '../config';
import type { BaccaratHand } from '../types';

export type Seat = 'player' | 'banker';

/** 一張牌在發牌動畫裡的時間點（毫秒，從發牌開始算） */
export interface CardTiming {
  seat: Seat;
  index: number; // 第幾張（0-2），2 = 補牌，橫置
  dealAt: number; // 從牌靴滑出
  flipAt: number; // 翻面
}

export interface DealTimeline {
  cards: CardTiming[];
  playerTotalAt: number; // 閒家點數顯示時間
  bankerTotalAt: number;
  totalMs: number; // 全部結束、可以派彩
}

/**
 * 百家樂發牌節奏：閒 1、莊 1、閒 2、莊 2 依序滑出，接著閒家兩張翻開、莊家兩張翻開，
 * 有補牌就再滑出一張橫置翻開。純函數，UI 只照表設 animation-delay 與 setTimeout。
 */
export function dealTimeline(hand: BaccaratHand, cfg = CONFIG): DealTimeline {
  const step = cfg.BACCARAT_DEAL_STEP_MS;
  const slide = cfg.BACCARAT_SLIDE_MS;
  const flipStep = cfg.BACCARAT_FLIP_STEP_MS;
  const flip = cfg.BACCARAT_FLIP_MS;

  const cards: CardTiming[] = [];
  // 前四張：交錯滑出
  const order: [Seat, number][] = [
    ['player', 0],
    ['banker', 0],
    ['player', 1],
    ['banker', 1],
  ];
  order.forEach(([seat, index], i) => cards.push({ seat, index, dealAt: i * step, flipAt: 0 }));
  const lastSlideEnd = 3 * step + slide;

  // 閒家先翻，再翻莊家
  let t = lastSlideEnd + 120;
  for (const c of cards) {
    if (c.seat !== 'player') continue;
    c.flipAt = t;
    t += flipStep;
  }
  const playerTotalAt = t + flip - flipStep;
  t += 80;
  for (const c of cards) {
    if (c.seat !== 'banker') continue;
    c.flipAt = t;
    t += flipStep;
  }
  let bankerTotalAt = t + flip - flipStep;
  t = bankerTotalAt + 160;

  // 補牌：閒先莊後，各自滑出後立刻翻
  if (hand.player.length > 2) {
    cards.push({ seat: 'player', index: 2, dealAt: t, flipAt: t + slide + 60 });
    t += slide + 60 + flip;
  }
  if (hand.banker.length > 2) {
    cards.push({ seat: 'banker', index: 2, dealAt: t, flipAt: t + slide + 60 });
    t += slide + 60 + flip;
    bankerTotalAt = t;
  }
  const playerTotalFinal = hand.player.length > 2 ? cards.find((c) => c.seat === 'player' && c.index === 2)!.flipAt + flip : playerTotalAt;

  return { cards, playerTotalAt: playerTotalFinal, bankerTotalAt, totalMs: t + 240 };
}

export function timingFor(timeline: DealTimeline, seat: Seat, index: number): CardTiming | undefined {
  return timeline.cards.find((c) => c.seat === seat && c.index === index);
}
