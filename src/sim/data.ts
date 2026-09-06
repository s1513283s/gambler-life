/**
 * 模擬器在 Node 裡同步讀資料檔。瀏覽器走 data/loaders.ts，這裡不能被 UI import。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  parseCompanyNames,
  parseCryptoFile,
  parseNbaFile,
  parseStockFile,
  type CryptoSegment,
  type NbaGameDay,
  type StockSegment,
} from '../data/schema';

let cryptoPool: CryptoSegment[] | null = null;
let stockPool: StockSegment[] | null = null;
let names: string[] | null = null;
let nbaPool: NbaGameDay[] | null = null;

function readJson(name: string): unknown {
  return JSON.parse(readFileSync(resolve(import.meta.dirname, '../data', name), 'utf8'));
}

export function cryptoSegments(): CryptoSegment[] {
  cryptoPool ??= parseCryptoFile(readJson('crypto_segments.json'));
  return cryptoPool;
}

export function stockSegments(): StockSegment[] {
  stockPool ??= parseStockFile(readJson('stock_segments.json'));
  return stockPool;
}

export function companyNames(): string[] {
  names ??= parseCompanyNames(readJson('company_names.json'));
  return names;
}

export function nbaDays(): NbaGameDay[] {
  nbaPool ??= parseNbaFile(readJson('nba_games.json'));
  return nbaPool;
}
