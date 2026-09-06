/**
 * 瀏覽器端載入。JSON 放在 src/data 用動態 import，Vite 會切成帶 hash 的 chunk，
 * 第一次進場才下載，之後永久快取。每個檔只解析一次。
 */
import {
  parseCompanyNames,
  parseCryptoFile,
  parseNbaFile,
  parseStockFile,
  type CryptoSegment,
  type NbaGameDay,
  type StockSegment,
} from './schema';

let cryptoPromise: Promise<CryptoSegment[]> | null = null;
let stockPromise: Promise<StockSegment[]> | null = null;
let namesPromise: Promise<string[]> | null = null;

export function loadCryptoSegments(): Promise<CryptoSegment[]> {
  cryptoPromise ??= import('./crypto_segments.json').then((m) => parseCryptoFile(m.default));
  return cryptoPromise;
}

export function loadStockSegments(): Promise<StockSegment[]> {
  stockPromise ??= import('./stock_segments.json').then((m) => parseStockFile(m.default));
  return stockPromise;
}

export function loadCompanyNames(): Promise<string[]> {
  namesPromise ??= import('./company_names.json').then((m) => parseCompanyNames(m.default));
  return namesPromise;
}

/** Title 畫面閒置時預抓，進場時零等待。失敗不管，進場時會再試。 */
export function prefetchData(): void {
  const run = () => {
    void loadCryptoSegments().catch(() => undefined);
    void loadStockSegments().catch(() => undefined);
    void loadCompanyNames().catch(() => undefined);
    void loadNbaDays().catch(() => undefined);
  };
  if ('requestIdleCallback' in window) window.requestIdleCallback(run);
  else setTimeout(run, 500);
}

let nbaPromise: Promise<NbaGameDay[]> | null = null;

export function loadNbaDays(): Promise<NbaGameDay[]> {
  nbaPromise ??= import('./nba_games.json').then((m) => parseNbaFile(m.default));
  return nbaPromise;
}
