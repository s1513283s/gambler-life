/**
 * 無頭模擬器 CLI。
 *   npm run sim                       # 全部 policy，各 1000 局
 *   npm run sim -- --runs 5000 --policy workWorkRest
 *   npm run sim -- --json > out.json  # 給 AI 或試算表分析
 */
import { POLICIES } from './policies';
import { simulateBatch, summarize, type BatchSummary } from './runner';

interface CliArgs {
  runs: number;
  seed: number;
  maxDays: number;
  policy: string | null;
  json: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { runs: 1000, seed: 20260906, maxDays: 365, policy: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === '--runs') args.runs = Number(value);
    else if (key === '--seed') args.seed = Number(value);
    else if (key === '--max-days') args.maxDays = Number(value);
    else if (key === '--policy') args.policy = value;
    else if (key === '--json') args.json = true;
  }
  return args;
}

/** 對照規格第 9 節的驗證標準，回傳一句話判定。 */
function verdict(s: BatchSummary): string {
  if (s.median < 20) return '中位數 < 20：降 EXPENSE_GROWTH 或提高 LOAN_CAP';
  if (s.timeoutPct > 50) return '一半以上活過上限：提高 EXPENSE_GROWTH 或降 WAGE';
  if (s.median >= 30 && s.median <= 50) return '中位數落在 30-50 目標區間';
  return '中位數在 20-30 或 50+，可接受';
}

const cell = (v: string | number, width: number) => String(v).padStart(width);

function printTable(rows: Array<{ name: string; summary: BatchSummary }>): void {
  const header = [
    'policy'.padEnd(16),
    cell('runs', 5),
    cell('med', 5),
    cell('p10', 5),
    cell('p90', 5),
    cell('min', 4),
    cell('max', 4),
    cell('rent%', 6),
    cell('san%', 6),
    cell('ret%', 5),
    cell('loans', 6),
    cell('peak', 8),
  ].join(' ');
  console.log(header);
  console.log('-'.repeat(header.length));
  for (const { name, summary: s } of rows) {
    console.log(
      [
        name.padEnd(16),
        cell(s.runs, 5),
        cell(s.median, 5),
        cell(s.p10, 5),
        cell(s.p90, 5),
        cell(s.min, 4),
        cell(s.max, 4),
        cell(s.rentPct.toFixed(0), 6),
        cell(s.sanityPct.toFixed(0), 6),
        cell(s.retiredPct.toFixed(0), 5),
        cell(s.avgLoans.toFixed(1), 6),
        cell(Math.round(s.avgPeak), 8),
      ].join(' '),
    );
  }
  console.log();
  for (const { name, summary } of rows) console.log(`${name}: ${verdict(summary)}`);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const names = args.policy === null ? Object.keys(POLICIES) : [args.policy];

  const rows = names.map((name) => {
    const policy = POLICIES[name];
    if (policy === undefined) {
      console.error(`unknown policy "${name}". available: ${Object.keys(POLICIES).join(', ')}`);
      process.exit(1);
    }
    const results = simulateBatch(policy, { runs: args.runs, baseSeed: args.seed, maxDays: args.maxDays });
    return { name, summary: summarize(results), results };
  });

  if (args.json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  printTable(rows);
}

main();
