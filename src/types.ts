import type { Candle, CryptoSegment, NbaGame, NbaGameDay, StockSegment } from './data/schema';

export type Phase =
  | 'TITLE'
  | 'ACTION'
  | 'VENUE'
  | 'EVENING'
  | 'NIGHT'
  | 'DEATH'
  | 'RETIRED';

export type VenueId =
  | 'baccarat'
  | 'blackjack'
  | 'crypto'
  | 'stocks'
  | 'scratch'
  | 'nba'
  | 'parlay'
  | 'sicbo'
  | 'niuniu'
  | 'longmen'
  | 'lending'
  | 'managing'
  | 'presale';

export const VENUE_IDS: readonly VenueId[] = [
  'baccarat',
  'blackjack',
  'crypto',
  'stocks',
  'scratch',
  'nba',
  'parlay',
  'sicbo',
  'niuniu',
  'longmen',
  'lending',
  'managing',
  'presale',
];

export type Tier = 0 | 1 | 2 | 3;

/** 解鎖層級（規格第 12 節）。tier 0 開局；tier 1 第一次借錢；tier 2 累計借款或地下場輸夠多；tier 3 淨值峰值夠高。 */
export const VENUE_TIER: Record<VenueId, Tier> = {
  scratch: 0,
  stocks: 0,
  crypto: 0,
  nba: 0,
  parlay: 0,
  baccarat: 1,
  blackjack: 1,
  sicbo: 2,
  niuniu: 2,
  longmen: 2,
  lending: 3,
  managing: 3,
  presale: 3,
};

export type PurchaseId = 'house' | 'buyout' | 'family' | 'party' | 'watch' | 'car';

/** 放出去的高利貸，一筆一筆記 */
export interface Lend {
  principal: number; // 含滾進來的利息
  startDay: number;
}

/** 代操：接了別人的錢，到期要還本金加分掉七成利潤 */
export interface Managed {
  principal: number;
  cashAtStart: number; // 接錢前的現金，算利潤用
  dueDay: number;
}

/** 預售屋：頭期款壓著，每晚權益隨機變動 */
export interface Property {
  downPayment: number;
  equity: number;
  startDay: number;
  dueDay: number;
}

export type BackgroundId = 'normal' | 'rich' | 'broke' | 'engineer' | 'comeback';

export interface BackgroundDef {
  id: BackgroundId;
  name: string;
  blurb: string;
  startCash: number;
  startDebt: number;
  wage: number;
  workSanityCost: number;
  expenseMultiplier: number;
}

/** free = 隨機 seed；daily = 日期 seed，全世界同一局 */
export type RunMode = 'free' | 'daily';

/** 今天的主行動。GAMBLE 代表進過場子。 */
export type DayAction = 'WORK' | 'REST' | 'GAMBLE' | 'NONE';

export type DeathCause = 'RENT' | 'SANITY' | 'LOAN_SHARK' | 'CLIENT';

export type NbaMarket = 'ml' | 'spread' | 'total';
export type NbaSide = 'home' | 'away' | 'over' | 'under';

/** 玩家選的一腿，賠率與盤口由 reducer 從今日賽程填入，不信任前端送來的數字 */
export interface NbaLegPick {
  gameId: string;
  market: NbaMarket;
  side: NbaSide;
}

export interface NbaBetLeg extends NbaLegPick {
  odds: number; // 十進位賠率
  line: number; // 讓分或大小分盤口；獨贏為 0
  home: string;
  away: string;
}

/** 單注與串關共用，串關 legs.length > 1 */
export interface NbaBet {
  id: string;
  stake: number;
  legs: NbaBetLeg[];
}

export type NbaLegOutcome = 'win' | 'loss' | 'push';

export interface NbaBetResult {
  bet: NbaBet;
  outcomes: NbaLegOutcome[];
  payout: number; // 退還總額（含本金），0 = 輸
  scores: { home: number; away: number }[]; // 與 legs 對齊
}

export interface StockPosition {
  slot: number; // 今日市場的第幾支（0-4）
  units: number; // 持有股數，可為小數
  avgCost: number; // 平均成本，單位基點（10000 = 100 元）
}

/** 一支假公司。closes 已把多段切片接續好，起點 10000。 */
export interface StockSlot {
  name: string;
  segmentIds: string[];
  closes: number[];
}

export interface VenueStats {
  wagered: number;
  net: number;
  sessions: number;
}

export interface RunStats {
  peakNetWorth: number;
  totalWagered: number;
  totalEvGiven: number; // 累計 注金 x 該場子莊家優勢
  biggestWin: number;
  biggestLoss: number;
  tiltEpisodes: number;
  daysWorked: number;
  daysGambled: number;
  daysRested: number;
  loansTaken: number;
  totalBorrowed: number; // 主動加自動借款的累計本金，解鎖用
  biggestWinDay: number;
  biggestLossDay: number;
  parlaysPlaced: number;
  parlaysWon: number;
  bjDecisions: number; // 21 點決策數
  bjMistakes: number; // 偏離基本策略次數
  byVenue: Record<VenueId, VenueStats>;
  causeOfDeath?: DeathCause;
}

export interface DayLog {
  day: number;
  cash: number;
  debt: number;
  sanity: number;
  action: DayAction;
  venueNet: number;
  expense: number;
}

export type EventId =
  | 'nothing'
  | 'bike_broke'
  | 'friend_repays'
  | 'overtime_pay'
  | 'rent_hike'
  | 'found_money'
  | 'sick'
  | 'insider_tip';

/** 事件表的一列。效果欄位全部可選，沒寫就是沒有該效果。 */
export interface EventDef {
  id: EventId;
  weight: number;
  cash?: number;
  sanity?: number;
  expenseMultiplier?: number; // 乘上去，永久
  requiresWork?: boolean; // 當天沒打工則視為無事發生
  blocksWorkTomorrow?: boolean;
  insiderTip?: boolean; // 明天 NBA 某場顯示內線標記
}

/** 0-51：rank = card % 13（0 = A … 12 = K），suit = floor(card / 13） */
export type Card = number;

export type BaccaratSide = 'banker' | 'player' | 'tie';

export interface BaccaratHand {
  player: Card[];
  banker: Card[];
  playerTotal: number;
  bankerTotal: number;
  outcome: BaccaratSide;
}

/** 已發牌但尚未派彩。注金已扣，派彩在 BACCARAT_RESOLVE 才進帳，動畫期間重整可從此續播。 */
export interface BaccaratPending {
  side: BaccaratSide;
  stake: number;
  hand: BaccaratHand;
}

export interface BaccaratResult extends BaccaratPending {
  payout: number; // 退還給玩家的總額（含本金），0 表示全輸
}

export interface BaccaratSession {
  kind: 'baccarat';
  shoe: Card[];
  cursor: number; // 下一張要發的位置
  handsPlayed: number;
  net: number; // 本次進場淨損益
  pending: BaccaratPending | null;
  lastResult: BaccaratResult | null;
}

export type BlackjackMove = 'hit' | 'stand' | 'double' | 'split';

export interface BjHand {
  cards: Card[];
  stake: number; // 加倍後是原注的兩倍
  done: boolean;
  fromSplit: boolean; // 分牌後的 21 不算黑傑克
}

export type BlackjackStage = 'PLAYER' | 'DEALER' | 'DONE';

/**
 * 一局 21 點。PLAYER：等玩家決策；DEALER：莊家已補完、派彩已算好但未進帳（動畫中）；
 * DONE：已派彩，等下一局。重整在任何 stage 都能續。
 */
export interface BlackjackRound {
  hands: BjHand[]; // 1 手，分牌後 2 手
  active: number; // 等決策的手牌索引
  dealer: Card[]; // dealer[0] 明牌，dealer[1] 底牌
  stage: BlackjackStage;
  payouts: number[]; // 每手退還總額，DEALER 階段算好
}

export interface BlackjackSession {
  kind: 'blackjack';
  shoe: Card[];
  cursor: number;
  handsPlayed: number;
  net: number;
  round: BlackjackRound | null; // null = 等下注
}

export interface ScratchTicket {
  price: number;
  prize: number; // 0 = 銘謝惠顧；等於 price = 回本
}

export interface ScratchSession {
  kind: 'scratch';
  handsPlayed: number; // 刮了幾張
  net: number;
  ticket: ScratchTicket | null; // 已買未刮，獎金已決定，刮開只是揭曉
  lastTicket: ScratchTicket | null;
}

export type CryptoDirection = 'long' | 'short';

export interface CryptoPosition {
  direction: CryptoDirection;
  leverage: number;
  margin: number;
  entryPrice: number; // 含滑點，單位基點
  entryIndex: number;
  takeProfitPct: number | null; // 保證金報酬率 %，null = 不設
  stopLossPct: number | null;
}

export type CryptoExitReason = 'closed' | 'tp' | 'sl' | 'liquidated' | 'expired';

export interface CryptoRoundResult {
  position: CryptoPosition;
  exitPrice: number;
  exitIndex: number;
  reason: CryptoExitReason;
  pnl: number; // 已扣手續費；爆倉 = -margin
}

/** 存進 session 的切片副本，重整後不需要再載資料檔。 */
export interface CryptoSegmentRef {
  id: string;
  symbol: string;
  candles: Candle[];
}

export interface CryptoSession {
  kind: 'crypto';
  segment: CryptoSegmentRef | null; // null = 等 UI 載入資料後 NEW_SEGMENT
  cursor: number; // 目前顯示到第幾根（含）
  playing: boolean; // TICK 推進中
  roundDone: boolean; // 這段已結算，要再玩得 NEW_SEGMENT
  position: CryptoPosition | null;
  handsPlayed: number;
  net: number;
  lastResult: CryptoRoundResult | null;
}

export type SicboBet = { kind: 'big' } | { kind: 'small' } | { kind: 'anyTriple' } | { kind: 'triple'; face: number };

export interface SicboPending {
  bet: SicboBet;
  stake: number;
  dice: [number, number, number];
}

export interface SicboResult extends SicboPending {
  payout: number;
}

export interface SicboSession {
  kind: 'sicbo';
  handsPlayed: number;
  net: number;
  pending: SicboPending | null;
  lastResult: SicboResult | null;
}

/** 妞妞一手：五張牌與牛值（0 = 無牛，1-9 = 牛幾，10 = 牛牛） */
export interface NiuHand {
  cards: Card[];
  niu: number;
}

export interface NiuniuPending {
  stake: number;
  player: NiuHand;
  banker: NiuHand;
}

export interface NiuniuResult extends NiuniuPending {
  payout: number; // 退還總額；輸時 0，但輸的倍數可能超過本金（另外從現金扣）
  multiplier: number; // 決定輸贏倍數的那一手
  playerWins: boolean;
}

export interface NiuniuSession {
  kind: 'niuniu';
  shoe: Card[];
  cursor: number;
  handsPlayed: number;
  net: number;
  pending: NiuniuPending | null;
  lastResult: NiuniuResult | null;
}

/** 射龍門：先發兩張門柱，玩家看牌下注，再開第三張 */
export interface LongmenRound {
  posts: [Card, Card];
  stake: number | null; // null = 還沒下注
  third: Card | null; // null = 還沒開
  payout: number; // 開牌後才有意義
  outcome: 'hit' | 'post' | 'miss' | null;
}

export interface LongmenSession {
  kind: 'longmen';
  shoe: Card[];
  cursor: number;
  handsPlayed: number;
  net: number;
  round: LongmenRound | null;
}

/** 場內進行中的狀態全部住在這裡，重整等於從同一狀態繼續。 */
export type VenueSession = BaccaratSession | BlackjackSession | ScratchSession | CryptoSession | SicboSession | NiuniuSession | LongmenSession;
export type VenueKind = VenueSession['kind'];

export type NightOutcome = 'CONTINUE' | 'RETIRE_OFFER' | 'DEATH';

export interface NightSettlement {
  step: 'SETTLE';
  expense: number;
  autoLoan: number; // 付不出開銷時自動向阿龍借的金額，0 表示沒借
  interest: number; // 今晚產生的利息
  harassed: boolean; // 討債電話
  thug: boolean; // 派人到門口，明天不能打工
  deadlineDaysLeft: number | null; // 借滿時阿龍給的倒數，null = 沒借滿
  lendInterest: number; // 高利貸今晚滾的利息
  lendDefaulted: number; // 跑路損失的本金
  propertyChange: number; // 預售屋權益變動
  propertyMarginCall: boolean;
  managedSettled: { profit: number; paid: number } | null; // 代操到期結算
  outcome: NightOutcome;
  deathCause: DeathCause | null;
}

/**
 * NIGHT 是一台小狀態機：EVENT（事件 modal，效果已套用）-> LIQUIDATE（付不出開銷且有持股時問要不要砍）-> SETTLE。
 * 每一步都存在 state 裡，重整後從同一步續玩。
 */
export type NightReport =
  | { step: 'EVENT'; event: EventId }
  | { step: 'LIQUIDATE'; shortfall: number } // 還差多少才付得出今晚開銷
  | NightSettlement;

export interface GameState {
  saveVersion: number;
  runId: string;
  seed: number;
  mode: RunMode;
  dailyKey: string | null; // daily 模式的日期，例如 2026-09-07
  background: BackgroundId;
  rngState: number; // mulberry32 狀態，所有遊戲內亂數由此推進
  day: number; // 從 1 開始
  phase: Phase;
  cash: number;
  debt: number; // 地下錢莊本利和
  sanity: number; // 0-100
  tilt: boolean; // 上頭狀態
  dailyExpense: number; // 今日應付開銷（已含成長與事件加成）
  expenseMultiplier: number; // 事件造成的永久加成
  actionUsedToday: boolean;
  todayAction: DayAction;
  workBlockedUntilDay: number; // day <= 此值時不能打工（生病），0 表示沒限制
  insiderTipDay: number; // 等於今天時 NBA 顯示內線標記，0 表示沒有
  venue: VenueSession | null; // phase === 'VENUE' 時必有
  venueNetToday: number;
  usedCryptoIds: string[]; // 本局玩過的切片，抽完才重複 // 今天在場子的淨損益，寫進 DayLog 後歸零
  nbaBets: NbaBet[]; // 今天已下、待結算
  nbaDayIndex: number; // 每天 +1，對應 nbaDayOrder 的位置
  nbaDayOrder: number[] | null; // 打亂的比賽日索引，-1 = 無賽事；第一次載入賽程時建立
  nbaToday: NbaGame[] | null; // 今日賽程副本，EVENING 用它結算
  nbaTodayDay: number; // nbaToday 對應的 day，不同就要重新載入
  insiderGameId: string | null; // 朋友報的明牌（純陷阱）
  nbaResults: NbaBetResult[]; // 今晚已揭曉的注單
  parlaysToday: number;
  stockMarket: StockSlot[] | null; // 第一次開股票畫面時建立，整局固定
  stockPositions: StockPosition[];
  stockDayIndex: number; // 指向每支 closes 的今日收盤
  unlockedVenues: VenueId[];
  pendingUnlock: VenueId[] | null; // 剛解鎖、等玩家看完對話
  daysMaxedOut: number; // 連續幾晚結算時債務仍在上限，阿龍倒數用
  expenseGrowth: number; // 每日開銷成長率，買房後變小
  loanSharkGone: boolean; // 買斷阿龍
  purchases: PurchaseId[];
  lends: Lend[];
  managed: Managed | null;
  property: Property | null;
  night: NightReport | null;
  stats: RunStats;
  history: DayLog[];
}

export type GameAction =
  | { type: 'NEW_RUN'; seed: number; runId: string; mode: RunMode; dailyKey: string | null; background: BackgroundId }
  | { type: 'ACK_UNLOCK' } // 看完解鎖對話
  | { type: 'BUY_ITEM'; item: PurchaseId } // 買房、買斷阿龍、給家裡錢、揮霍，各一次
  | { type: 'LEND'; amount: number } // 放高利貸
  | { type: 'COLLECT_LEND'; index: number } // 收回一筆
  | { type: 'ACCEPT_MANAGE' } // 接代操
  | { type: 'BUY_PRESALE'; amount: number } // 付頭期款
  | { type: 'SELL_PRESALE' } // 提前賣掉
  | { type: 'WORK' }
  | { type: 'REST' }
  | { type: 'BORROW'; amount: number } // 不佔主行動
  | { type: 'REPAY'; amount: number } // 不佔主行動
  | { type: 'ENTER_VENUE'; venue: VenueKind } // ACTION -> VENUE，佔主行動
  | { type: 'BACCARAT_BET'; side: BaccaratSide; stake: number } // 扣注金、發牌
  | { type: 'BACCARAT_RESOLVE' } // 派彩、精神、統計
  | { type: 'BLACKJACK_DEAL'; stake: number } // 扣注金、發牌、檢查黑傑克
  | { type: 'BLACKJACK_MOVE'; move: BlackjackMove } // 玩家決策，記錄與基本策略的差異
  | { type: 'BLACKJACK_RESOLVE' } // 派彩、精神、統計
  | { type: 'SCRATCH_BUY'; price: number } // 扣錢、擲獎、每張精神 -2
  | { type: 'SCRATCH_REVEAL' } // 獎金進帳
  | { type: 'CRYPTO_NEW_SEGMENT'; pool: readonly CryptoSegment[] } // 從資料池抽一段沒玩過的
  | { type: 'CRYPTO_OPEN'; direction: CryptoDirection; leverage: number; margin: number; takeProfitPct: number | null; stopLossPct: number | null }
  | { type: 'CRYPTO_TICK' } // 播下一根 K，檢查爆倉 / 停利停損 / 播完
  | { type: 'CRYPTO_CLOSE' } // 手動平倉
  | { type: 'SICBO_BET'; bet: SicboBet; stake: number }
  | { type: 'SICBO_RESOLVE' }
  | { type: 'NIUNIU_BET'; stake: number }
  | { type: 'NIUNIU_RESOLVE' }
  | { type: 'LONGMEN_DEAL' } // 發兩張門柱
  | { type: 'LONGMEN_BET'; stake: number } // 看牌後下注，同時開第三張
  | { type: 'LONGMEN_RESOLVE' } // 派彩
  | { type: 'STOCK_OPEN_MARKET'; pool: readonly StockSegment[]; names: readonly string[] } // 建立五支假公司
  | { type: 'STOCK_BUY'; slot: number; amount: number } // 不佔主行動，精神 -3
  | { type: 'STOCK_SELL'; slot: number; fraction: 0.5 | 1 } // 不佔主行動，精神 -3，實現損益另計
  | { type: 'NIGHT_SKIP_LIQUIDATE' } // NIGHT.LIQUIDATE -> SETTLE
  | { type: 'NBA_LOAD_DAY'; pool: readonly NbaGameDay[] } // 載入今日賽程（第一次順便建打亂順序）
  | { type: 'NBA_BET'; legs: NbaLegPick[]; stake: number } // 單注或串關，精神 -5
  | { type: 'EVENING_REVEAL' } // 結算下一張注單
  | { type: 'EVENING_DONE' } // 全部揭曉後進 NIGHT
  | { type: 'LEAVE_VENUE' } // VENUE -> ACTION
  | { type: 'END_DAY' } // ACTION -> NIGHT（擲事件；有事件停在 EVENT，否則直接 SETTLE）
  | { type: 'NIGHT_ACK_EVENT' } // NIGHT.EVENT -> NIGHT.SETTLE
  | { type: 'NEXT_DAY' } // NIGHT.SETTLE -> ACTION 或 DEATH
  | { type: 'RETIRE' } // NIGHT.SETTLE（上岸提議）-> RETIRED
  | { type: 'BACK_TO_TITLE' };

export type GameActionType = GameAction['type'];
