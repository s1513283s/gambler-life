/**
 * build 前跑：讀 src/data/*.json，用 schema.ts 驗證，壞資料直接讓 build 失敗。
 *   npx tsx scripts/validate-data.ts
 */
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseCompanyNames, parseCryptoFile, parseNbaFile, parseStockFile } from '../src/data/schema';

const DATA_DIR = resolve(import.meta.dirname, '../src/data');

function readJson(name: string): unknown {
  return JSON.parse(readFileSync(resolve(DATA_DIR, name), 'utf8'));
}

function kb(name: string): number {
  return Math.round(statSync(resolve(DATA_DIR, name)).size / 1024);
}

function countBy<T>(items: T[], pick: (t: T) => string): string {
  const counts = new Map<string, number>();
  for (const it of items) counts.set(pick(it), (counts.get(pick(it)) ?? 0) + 1);
  return [...counts.entries()].map(([k, v]) => `${k}=${v}`).join(' ');
}

try {
  const crypto = parseCryptoFile(readJson('crypto_segments.json'));
  console.log(`crypto_segments.json  ${kb('crypto_segments.json')} KB  ${crypto.length} segments  vol: ${countBy(crypto, (s) => s.vol)}  symbol: ${countBy(crypto, (s) => s.symbol)}`);

  const stocks = parseStockFile(readJson('stock_segments.json'));
  console.log(`stock_segments.json   ${kb('stock_segments.json')} KB  ${stocks.length} segments  vol: ${countBy(stocks, (s) => s.vol)}  market: ${countBy(stocks, (s) => s.market)}`);

  const nba = parseNbaFile(readJson('nba_games.json'));
  const games = nba.reduce((sum, d) => sum + d.games.length, 0);
  console.log(`nba_games.json        ${kb('nba_games.json')} KB  ${nba.length} game days  ${games} games`);

  const names = parseCompanyNames(readJson('company_names.json'));
  console.log(`company_names.json    ${names.length} names`);
} catch (err) {
  console.error(`data validation failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
