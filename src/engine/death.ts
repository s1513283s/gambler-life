import { CONFIG } from '../config';
import type { DeathCause, GameState } from '../types';
import { netWorth } from './economy';
import { PURCHASES } from './richReducer';

export const DEATH_CAUSE_LABEL: Record<DeathCause, string> = {
  RENT: '付不出房租',
  SANITY: '精神崩潰',
  LOAN_SHARK: '被阿龍帶走',
  CLIENT: '賠光金主的錢',
};

export interface CardLine {
  label: string;
  value: string;
}

export function formatMoney(n: number): string {
  return Math.round(n).toLocaleString('zh-TW');
}

/** 文字版死亡卡片。RETIRED 時標題改為上岸，其餘欄位相同。 */
export function buildDeathCard(state: GameState): { title: string; lines: CardLine[] } {
  const s = state.stats;
  const retired = state.phase === 'RETIRED';
  const cause = s.causeOfDeath ? DEATH_CAUSE_LABEL[s.causeOfDeath] : '';

  const bg = CONFIG.BACKGROUNDS.find((b) => b.id === state.background);
  const lines: CardLine[] = [
    {
      label: retired ? '結局' : '死因',
      value: retired ? `上岸，淨值 ${formatMoney(netWorth(state))}` : cause,
    },
    { label: '身分', value: `${bg?.name ?? ''}${state.mode === 'daily' ? ` · 每日挑戰 ${state.dailyKey ?? ''}` : ''}` },
    { label: '淨值最高', value: formatMoney(s.peakNetWorth) },
    { label: '總下注', value: formatMoney(s.totalWagered) },
    { label: '這輩子送給莊家的 EV', value: formatMoney(s.totalEvGiven) },
    { label: '最大單筆獲利', value: `+${formatMoney(s.biggestWin)}` },
    { label: '最大單筆虧損', value: `-${formatMoney(Math.abs(s.biggestLoss))}` },
    { label: '上頭次數', value: String(s.tiltEpisodes) },
    {
      label: '打工 / 賭博 / 休息',
      value: `${s.daysWorked} / ${s.daysGambled} / ${s.daysRested} 天`,
    },
    { label: '向阿龍借款', value: `${s.loansTaken} 次` },
  ];
  const bought = state.purchases.filter((p) => p !== 'family').map((p) => PURCHASES.find((d) => d.id === p)?.name ?? p);
  if (bought.length > 0) lines.push({ label: '這輩子買過', value: bought.join('、') });
  if (state.purchases.includes('family')) lines.push({ label: '稱號', value: '孝子' });
  if (s.parlaysPlaced > 0) {
    lines.push({ label: '串關張數 / 全中', value: `${s.parlaysPlaced} / ${s.parlaysWon}` });
  }
  if (s.bjDecisions > 0) {
    const accuracy = Math.round(((s.bjDecisions - s.bjMistakes) / s.bjDecisions) * 100);
    lines.push({ label: '21 點基本策略正確率', value: `${accuracy}%` });
  }

  return { title: retired ? `第 ${state.day} 天，上岸` : `第 ${state.day} 天`, lines };
}
