import { VENUE_IDS, type GameState } from '../types';
import type { KeyValueStore } from './runlog';

export interface AchievementDef {
  id: string;
  name: string;
  blurb: string;
  check: (state: GameState) => boolean;
}

/** 一局結束時用最終狀態判定。跨局累積存在 meta。 */
export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: 'first_run', name: '第一次', blurb: '玩完一局', check: () => true },
  { id: 'survive20', name: '撐過三週', blurb: '活過 20 天', check: (s) => s.day >= 20 },
  { id: 'survive40', name: '老油條', blurb: '活過 40 天', check: (s) => s.day >= 40 },
  { id: 'retired', name: '上岸', blurb: '淨值破百萬收手', check: (s) => s.ending === 'retired' },
  { id: 'fled', name: '通緝中', blurb: '帶著錢跑路', check: (s) => s.ending === 'fled' },
  { id: 'sober', name: '你好了', blurb: '戒賭結局', check: (s) => s.ending === 'sober' },
  { id: 'ruined', name: '家破人亡', blurb: '家人離開後死去', check: (s) => s.ending === 'ruined' },
  { id: 'rent_death', name: '付不出房租', blurb: '最普通的死法', check: (s) => s.stats.causeOfDeath === 'RENT' },
  { id: 'sanity_death', name: '精神崩潰', blurb: '精神歸零', check: (s) => s.stats.causeOfDeath === 'SANITY' },
  { id: 'loan_shark_death', name: '被阿龍帶走', blurb: '借滿七天不還', check: (s) => s.stats.causeOfDeath === 'LOAN_SHARK' },
  { id: 'client_death', name: '賠光金主的錢', blurb: '代操到期還不出來', check: (s) => s.stats.causeOfDeath === 'CLIENT' },
  { id: 'parlay6', name: '六串一', blurb: '六腿串關全中', check: (s) => s.stats.maxParlayLegsWon >= 6 },
  { id: 'liquidated5', name: '爆倉專家', blurb: '爆倉五次', check: (s) => s.stats.liquidations >= 5 },
  { id: 'scratch_jackpot', name: '中頭獎', blurb: '刮刮樂刮中頭獎', check: (s) => s.stats.scratchJackpots >= 1 },
  { id: 'tilt3', name: '上頭三次', blurb: '同一局上頭三次', check: (s) => s.stats.tiltEpisodes >= 3 },
  { id: 'borrowed_max', name: '借滿', blurb: '欠阿龍欠到上限', check: (s) => s.stats.totalBorrowed >= 25000 },
  { id: 'house', name: '有房', blurb: '買了房', check: (s) => s.purchases.includes('house') },
  { id: 'buyout', name: '再見阿龍', blurb: '買斷阿龍', check: (s) => s.purchases.includes('buyout') },
  { id: 'all_venues', name: '逛遍', blurb: '七個場子都去過', check: (s) => ['baccarat', 'blackjack', 'crypto', 'scratch', 'sicbo', 'niuniu', 'longmen'].every((v) => s.stats.venuesVisited.includes(v as (typeof VENUE_IDS)[number])) },
  { id: 'streak7', name: '手氣正旺', blurb: '一個場子連贏七把', check: (s) => s.stats.maxWinStreak >= 7 },
  { id: 'meme_moon', name: '噴了', blurb: '土狗幣十倍', check: (s) => s.stats.memeMoons >= 1 },
  { id: 'meme_rug', name: '歸零', blurb: '土狗幣被割', check: (s) => s.stats.memeRugs >= 1 },
  { id: 'peak300k', name: '西裝男注意到你', blurb: '淨值峰值 30 萬', check: (s) => s.stats.peakNetWorth >= 300000 },
  { id: 'daily', name: '每日挑戰者', blurb: '玩完一次每日挑戰', check: (s) => s.mode === 'daily' },
  { id: 'obsession', name: '執念達成', blurb: '完成這一局的執念', check: (s) => s.obsession.done },
  { id: 'filial', name: '孝子', blurb: '給家裡錢', check: (s) => s.purchases.includes('family') },
  { id: 'lonely', name: '一個人', blurb: '阿明跑路、家人離開', check: (s) => s.relations.friendGone && s.relations.familyGone },
];

export const ACHIEVEMENTS_KEY = 'gambler-life:achievements';

export function loadAchievements(store: KeyValueStore): string[] {
  try {
    const raw = store.getItem(ACHIEVEMENTS_KEY);
    return raw === null ? [] : (JSON.parse(raw) as string[]).filter((x) => typeof x === 'string');
  } catch {
    return [];
  }
}

/** 判定並寫入，回傳這局新拿到的 */
export function recordAchievements(store: KeyValueStore, state: GameState): AchievementDef[] {
  const had = new Set(loadAchievements(store));
  const fresh = ACHIEVEMENTS.filter((a) => !had.has(a.id) && a.check(state));
  if (fresh.length > 0) {
    try {
      store.setItem(ACHIEVEMENTS_KEY, JSON.stringify([...had, ...fresh.map((a) => a.id)]));
    } catch {
      // 存不了就算了
    }
  }
  return fresh;
}
