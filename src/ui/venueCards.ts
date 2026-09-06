import { CONFIG } from '../config';
import type { VenueKind } from '../types';
import type { IconName } from './components/Icon';

interface VenueCard {
  kind: VenueKind;
  icon: IconName;
  name: string;
  ev: string;
  note: string;
  accent: string; // CSS 顏色，卡片微光
}

export const VENUE_CARDS: VenueCard[] = [
  { kind: 'scratch', icon: 'scratch', name: '刮刮樂', ev: `EV −${Math.round((1 - CONFIG.SCRATCH_RTP) * 100)}%`, note: '幾乎沒輸的錯覺', accent: '#ff3cac' },
  { kind: 'crypto', icon: 'crypto', name: '幣圈合約', ev: `最高 ${CONFIG.CRYPTO_MAX_LEVERAGE}x`, note: '手續費在等你', accent: '#39ff9a' },
  { kind: 'baccarat', icon: 'baccarat', name: '百家樂', ev: `EV −${(CONFIG.BACCARAT_EDGE.banker * 100).toFixed(2)}%`, note: '慢慢輸的那種', accent: '#f5c542' },
  { kind: 'blackjack', icon: 'blackjack', name: '21 點', ev: `EV −${(CONFIG.BLACKJACK_BASE_EDGE * 100).toFixed(1)}% 起`, note: '打錯一次多送 1%', accent: '#e2c275' },
  { kind: 'sicbo', icon: 'dice', name: '骰寶', ev: `EV −${(CONFIG.SICBO_EDGE.big * 100).toFixed(1)}% 到 −${Math.round(CONFIG.SICBO_EDGE.anyTriple * 100)}%`, note: '圍骰賠 24 倍', accent: '#ff6b35' },
  { kind: 'niuniu', icon: 'niuniu', name: '妞妞', ev: `EV −${Math.round(CONFIG.NIUNIU_EDGE * 100)}%`, note: '牛牛賠三倍，輸也三倍', accent: '#c084fc' },
  { kind: 'longmen', icon: 'gate', name: '射龍門', ev: '撞柱賠雙倍', note: '看牌再下注', accent: '#29d3ff' },
];

