import type { EventDef } from './types';

/**
 * 所有可調數值的唯一真相來源。
 * 調平衡只改這裡，engine 與 ui 不得硬編數字。
 */
export const CONFIG = {
  SAVE_VERSION: 10,

  // 經濟
  START_CASH: 15000,
  BASE_EXPENSE: 1000,
  EXPENSE_GROWTH: 0.04, // 每日 +4%，目標一局 15-25 天
  WAGE: 800,

  // 精神
  SANITY_MAX: 100,
  SANITY_START: 80,
  WORK_SANITY_COST: 15,
  REST_SANITY_GAIN: 30,
  NBA_BET_SANITY_COST: 5,
  GAMBLE_WIN_SANITY: 3,
  GAMBLE_LOSS_SANITY: 5,
  TILT_THRESHOLD: 30, // 低於此值進入上頭
  TILT_EXIT: 45, // 高於此值解除
  TILT_MIN_BET_RATIO: 0.25, // 上頭時最小注碼 = 現金 25%
  TILT_FORCED_HANDS: 3, // 上頭時進場至少玩 3 局才能走

  // 地下錢莊
  LOAN_CAP: 25000,
  LOAN_DAILY_RATE: 0.03,
  LOAN_UNIT: 5000,
  DEBT_HARASS_THRESHOLD: 12000, // 討債電話
  HARASS_SANITY_COST: 10,
  DEBT_THUG_THRESHOLD: 20000, // 派人到門口：明天不能打工，精神再扣
  THUG_SANITY_COST: 5,
  DEBT_DEADLINE_DAYS: 7, // 借滿連續幾晚沒降到上限以下就被帶走

  // 上岸
  RETIRE_THRESHOLD: 1000000,

  // 百家樂
  BACCARAT_MIN_BET: 100,
  BACCARAT_DECKS: 8,
  BACCARAT_CUT_CARD: 52, // 牌靴剩不到這麼多張就重洗
  BACCARAT_COMMISSION: 0.05, // 莊贏抽 5%
  BACCARAT_TIE_PAYOUT: 8, // 和局 8:1
  BACCARAT_EDGE: { banker: 0.0106, player: 0.0124, tie: 0.144 },
  BACCARAT_REVEAL_MS: 2000, // 發牌動畫
  BACCARAT_RESULT_MS: 1000, // 結果停留

  // 21 點
  BLACKJACK_MIN_BET: 100,
  BLACKJACK_DECKS: 6,
  BLACKJACK_PAYOUT: 1.5, // 黑傑克 3:2
  BLACKJACK_CUT_CARD: 52,
  BLACKJACK_BASE_EDGE: 0.005,
  BLACKJACK_MISTAKE_EDGE: 0.01, // 每次偏離基本策略多送的 EV
  BLACKJACK_NATURAL_SANITY: 5, // 拿到黑傑克
  BLACKJACK_REVEAL_MS: 1500, // 莊家翻牌動畫

  // 幣圈合約
  CRYPTO_MIN_MARGIN: 500,
  CRYPTO_MAX_LEVERAGE: 50,
  CRYPTO_FEE: 0.0005, // 開倉 + 平倉各一次，乘名目部位
  CRYPTO_SLIPPAGE: 0.0002,
  LIQ_RATIO: 0.9, // 未實現虧損 >= 保證金 x 0.9 即爆倉
  CRYPTO_LIQ_SANITY: 15,
  CRYPTO_CANDLES_PER_SECOND: 3,
  CRYPTO_DEFAULT_LEVERAGE: 10,
  CRYPTO_LEVERAGE_PRESETS: [2, 5, 10, 25, 50],
  CRYPTO_TP_OPTIONS: [50, 100, 200], // 停利，保證金報酬率 %
  CRYPTO_SL_OPTIONS: [25, 50], // 停損，保證金報酬率 %
  CRYPTO_LIQ_FLASH_MS: 700, // 爆倉紅閃

  // 股票日線
  STOCK_FEE: 0.001425, // 台股手續費，買賣各一次
  STOCK_TAX: 0.003, // 證交稅，賣出時
  STOCK_MIN_LOT: 1000,
  STOCK_TRADE_SANITY_COST: 3,
  STOCK_UNDERWATER_RATIO: 0.2, // 浮虧超過 20% 每天額外扣精神
  STOCK_UNDERWATER_SANITY: 3,
  STOCK_MARKET_SIZE: 5,
  STOCK_VISIBLE_HISTORY: 20, // 進場時先看得到的過去天數
  STOCK_START_OFFSET_MAX: 40, // 切片起點隨機偏移，同一段每局長得不一樣
  STOCK_CHAIN_SEGMENTS: 3, // 每支股票預先接續幾段，夠玩 300 天以上

  // 刮刮樂
  SCRATCH_TICKETS: [
    { price: 100, jackpot: 10000 },
    { price: 200, jackpot: 100000 },
    { price: 500, jackpot: 1000000 },
  ],
  // 非頭獎獎項：面額倍數與機率。回本那級佔 RTP 的七成，製造「幾乎沒輸」的感覺。
  SCRATCH_TIERS: [
    { multiplier: 1, p: 0.385 },
    { multiplier: 2, p: 0.015 },
    { multiplier: 5, p: 0.01 },
    { multiplier: 20, p: 0.004 },
  ],
  SCRATCH_JACKPOT_RTP: 0.005, // 頭獎佔的 RTP，機率 = 此值 x 面額 / 頭獎
  SCRATCH_RTP: 0.55, // 上面兩張表加總必須等於這個值（有測試鎖住）
  SCRATCH_SANITY_COST: 2, // 每張
  SCRATCH_REVEAL_RATIO: 0.6, // 刮開六成自動揭曉

  // NBA
  NBA_MIN_BET: 200,
  NBA_VIG: 0.045,
  PARLAY_MIN_LEGS: 2,
  PARLAY_MAX_LEGS: 6,
  PARLAY_MAX_PER_DAY: 3,
  PARLAY_WIN_SANITY: 10,
  PARLAY_LOSS_SANITY: 5,
  NBA_NO_GAME_DAY_RATE: 0.15, // 打亂賽程時插入的無賽事日比例
  NBA_REVEAL_MS: 2000, // 晚上逐張揭曉的間隔

  DAY_TARGET_SECONDS: 30,

  // 開局背景：覆蓋起手數值
  BACKGROUNDS: [
    { id: 'normal', name: '一般人', blurb: '起手一萬五，日薪八百。', startCash: 15000, startDebt: 0, wage: 800, workSanityCost: 15, expenseMultiplier: 1 },
    { id: 'rich', name: '富二代', blurb: '起手五萬，但開銷是別人的兩倍。', startCash: 50000, startDebt: 0, wage: 800, workSanityCost: 15, expenseMultiplier: 2 },
    { id: 'broke', name: '月光族', blurb: '起手五千，已經欠阿龍一萬。', startCash: 5000, startDebt: 10000, wage: 800, workSanityCost: 15, expenseMultiplier: 1 },
    { id: 'engineer', name: '工程師', blurb: '日薪一千五，但打工很傷精神。', startCash: 15000, startDebt: 0, wage: 1500, workSanityCost: 25, expenseMultiplier: 1 },
    { id: 'comeback', name: '退休又回來的人', blurb: '上岸過一次才解鎖。起手十萬，但開銷是三倍。', startCash: 100000, startDebt: 0, wage: 800, workSanityCost: 15, expenseMultiplier: 3 },
  ],

  // 解鎖制（規格第 12 節）
  UNLOCK_TIER2_BORROWED: 20000, // 累計借款達此值解鎖地下場
  UNLOCK_TIER2_LOST: 30000, // 或在百家樂 / 21 點累計輸超過此值

  // 骰寶
  SICBO_MIN_BET: 100,
  SICBO_EDGE: { big: 0.0278, small: 0.0278, anyTriple: 0.306, triple: 0.162 },
  SICBO_ANY_TRIPLE_PAYOUT: 24,
  SICBO_TRIPLE_PAYOUT: 180,
  SICBO_REVEAL_MS: 1400,

  // 妞妞
  NIUNIU_MIN_BET: 100,
  NIUNIU_DECKS: 4,
  NIUNIU_CUT_CARD: 30,
  NIUNIU_EDGE: 0.03, // 平手歸莊造成的優勢，實測約 3%
  NIUNIU_REVEAL_MS: 1600,

  // 射龍門
  LONGMEN_MIN_BET: 100,
  LONGMEN_DECKS: 4,
  LONGMEN_CUT_CARD: 20,
  LONGMEN_EDGE: 0.03, // 撞柱賠雙倍帶來的長期優勢
  LONGMEN_POST_MULTIPLIER: 2,
  LONGMEN_REVEAL_MS: 1200,

  // 錢的用途：一次性消費
  HOUSE_PRICE: 300000, // 買房：開銷成長減半
  HOUSE_EXPENSE_GROWTH: 0.02,
  BUYOUT_PRICE: 150000, // 買斷阿龍：從此不能借也不會被討
  FAMILY_GIFT: 100000, // 給家裡錢：孝子結局標籤
  FAMILY_SANITY: 20,
  SHOP_ITEMS: [
    { id: 'party', name: '包場開趴', price: 30000, sanity: 25 },
    { id: 'watch', name: '勞力士', price: 50000, sanity: 30 },
    { id: 'car', name: '保時捷', price: 200000, sanity: 40 },
  ],

  // 第三層：有錢人的玩法（淨值峰值達此值解鎖）
  RICH_TIER_NET_WORTH: 300000,
  LEND_MIN: 50000, // 放高利貸最低本金
  LEND_RATE: 0.02, // 日息，複利滾進本金
  LEND_DEFAULT_RATE: 0.01, // 每晚跑路機率；期望值約 +1% / 天，全遊戲唯一正 EV
  MANAGE_PRINCIPAL: 500000, // 代操：接管的金額
  MANAGE_DAYS: 10,
  MANAGE_SHARE: 0.3, // 賺的分三成
  PRESALE_MIN: 200000, // 預售屋頭期款最低
  PRESALE_DAYS: 10,
  PRESALE_MOVE_MIN: 0.03, // 每晚權益變動幅度
  PRESALE_MOVE_MAX: 0.08,
  PRESALE_MARGIN_CALL: 0.3, // 權益跌到頭期款的三成就斷頭

  // 排行榜與分析紀錄
  LEADERBOARD_SIZE: 10,
  RUNLOG_SIZE: 50, // localStorage 只留最近 50 局
  DEATH_CARD_WIDTH: 1080,
  DEATH_CARD_HEIGHT: 1350,

  // 事件表（NIGHT 觸發，每晚最多一個；weight 總和 100）
  EVENT_TABLE: [
    { id: 'nothing', weight: 60 },
    { id: 'bike_broke', weight: 8, cash: -2000 },
    { id: 'friend_repays', weight: 6, cash: 1500 },
    { id: 'overtime_pay', weight: 6, cash: 400, requiresWork: true },
    { id: 'rent_hike', weight: 5, expenseMultiplier: 1.1 },
    { id: 'found_money', weight: 5, cash: 500 },
    { id: 'sick', weight: 5, sanity: -10, blocksWorkTomorrow: true },
    { id: 'insider_tip', weight: 5, insiderTip: true },
  ] as const satisfies readonly EventDef[],
} as const;

export type Config = typeof CONFIG;
