"""
產出遊戲用的歷史資料切片。

    python scripts/build_segments.py                 # 幣圈 500 段 + 股票 300 段
    python scripts/build_segments.py --crypto 0      # 只跑股票
    python scripts/build_segments.py --seed 7        # 換一組抽樣

輸出 src/data/crypto_segments.json 與 src/data/stock_segments.json。

編碼（TS 端 loaders.ts 的 decode 必須對應）：
  所有價格先正規化為「起點 = 10000 個基點」的整數。
  幣圈每根 K 存 [o - prevClose, h - o, l - o, c - o]，第一根的 prevClose = 10000。
  股票存每日 close 相對前一日的差，第一日相對 10000。
  這樣大多數數字只有兩三位，檔案比直接存價格小一半。
"""

from __future__ import annotations

import argparse
import json
import math
import random
import statistics
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

BASE = 10000
CRYPTO_LEN = 60
STOCK_LEN = 160  # 遊戲只玩 120 天，多存 40 天讓起點可隨機偏移

CRYPTO_SYMBOLS = ["BTCUSDT", "ETHUSDT"]
BINANCE = "https://api.binance.com/api/v3/klines"

TW_TICKERS = [
    "2330", "2317", "2454", "2308", "2303", "2412", "2882", "2881", "1301", "1303",
    "2002", "2886", "2891", "3008", "2357", "2382", "2395", "3034", "3037", "2409",
    "2603", "2609", "2615", "2610", "1101", "1216", "2207", "2912", "9910", "1402",
    "2105", "2801", "2880", "2884", "2885", "2887", "2890", "2892", "5880", "6505",
    "2379", "3231", "2356", "2324", "2353", "2377", "4938", "6669", "3443", "3661",
    "2327", "2360", "1476", "9904", "2542", "2515", "1504", "1605", "2618", "2637",
]
US_TICKERS = [
    "AAPL", "MSFT", "AMZN", "GOOGL", "META", "NVDA", "TSLA", "NFLX", "AMD", "INTC",
    "JPM", "BAC", "WFC", "C", "GS", "XOM", "CVX", "PFE", "JNJ", "MRK",
    "KO", "PEP", "WMT", "COST", "HD", "NKE", "DIS", "BA", "CAT", "GE",
    "F", "GM", "UBER", "PLTR", "COIN", "SNAP", "SHOP", "ROKU", "ZM", "GME",
    "AMC", "NOK", "RIVN", "LCID", "NIO", "BABA", "CCL", "NCLH", "UAL", "DAL",
    "AAL", "MGM", "WYNN", "LVS", "CZR", "DKNG", "SOFI", "HOOD", "MARA", "RIOT",
]


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def vol_label(values: list[float], v: float) -> str:
    """依全體分佈切三等份。"""
    s = sorted(values)
    lo = s[len(s) // 3]
    hi = s[(2 * len(s)) // 3]
    if v < lo:
        return "low"
    if v < hi:
        return "mid"
    return "high"


def realized_vol(closes: list[float]) -> float:
    rets = [math.log(closes[i] / closes[i - 1]) for i in range(1, len(closes))]
    return statistics.pstdev(rets) if len(rets) > 1 else 0.0


# ---------------- 幣圈 ----------------


def fetch_klines(symbol: str, start_ms: int, interval: str, limit: int = 1000) -> list[list]:
    for attempt in range(5):
        r = requests.get(
            BINANCE,
            params={"symbol": symbol, "interval": interval, "startTime": start_ms, "limit": limit},
            timeout=20,
        )
        if r.status_code == 200:
            return r.json()
        if r.status_code in (418, 429):
            wait = 2 ** attempt
            log(f"  rate limited, sleeping {wait}s")
            time.sleep(wait)
            continue
        raise RuntimeError(f"binance {r.status_code}: {r.text[:200]}")
    raise RuntimeError("binance: too many retries")


def encode_candles(candles: list[tuple[float, float, float, float]]) -> list[list[int]]:
    """正規化到起點 10000，再差分編碼。"""
    c0 = candles[0][3]
    scale = BASE / c0
    out = []
    prev_close = BASE
    for o, h, l, c in candles:
        oi, hi, li, ci = (round(o * scale), round(h * scale), round(l * scale), round(c * scale))
        # 保證 h >= max(o,c) 且 l <= min(o,c)，四捨五入可能破壞
        hi = max(hi, oi, ci)
        li = min(li, oi, ci)
        out.append([oi - prev_close, hi - oi, li - oi, ci - oi])
        prev_close = ci
    return out


INTERVAL_MS = {"1m": 60_000, "5m": 300_000, "15m": 900_000}


def build_crypto(n: int, rng: random.Random, interval: str, days_back: int = 730) -> list[dict]:
    if n <= 0:
        return []
    now_ms = int(time.time() * 1000)
    span_ms = days_back * 86400 * 1000
    per_fetch = 8
    fetches = math.ceil(n / per_fetch)
    raw: list[dict] = []
    log(f"crypto: {fetches} fetches x {per_fetch} windows")
    for i in range(fetches):
        symbol = CRYPTO_SYMBOLS[i % len(CRYPTO_SYMBOLS)]
        start = now_ms - rng.randint(86400 * 1000, span_ms)
        rows = fetch_klines(symbol, start, interval)
        if len(rows) < 1000:
            continue
        # 在 1000 根裡取 per_fetch 個互不重疊的 60 根視窗，起點隨機
        offsets = list(range(0, 1000 - CRYPTO_LEN, CRYPTO_LEN))
        rng.shuffle(offsets)
        for off in offsets[:per_fetch]:
            window = rows[off : off + CRYPTO_LEN]
            times = [r[0] for r in window]
            if any(times[k + 1] - times[k] != INTERVAL_MS[interval] for k in range(len(times) - 1)):
                continue
            candles = [(float(r[1]), float(r[2]), float(r[3]), float(r[4])) for r in window]
            if any(c[3] <= 0 for c in candles):
                continue
            raw.append({"symbol": symbol[:3], "closes": [c[3] for c in candles], "candles": candles})
        if (i + 1) % 10 == 0:
            log(f"  {len(raw)} windows so far")
        time.sleep(0.15)

    vols = [realized_vol(r["closes"]) for r in raw]
    segments = []
    for idx, (r, v) in enumerate(zip(raw, vols)):
        segments.append(
            {
                "id": f"seg_{idx + 1:04d}",
                "symbol": r["symbol"],
                "vol": vol_label(vols, v),
                "d": encode_candles(r["candles"]),
            }
        )
    rng.shuffle(segments)
    return segments[:n]


# ---------------- 股票 ----------------


def encode_closes(closes: list[float]) -> list[int]:
    scale = BASE / closes[0]
    prev = BASE
    out = []
    for c in closes:
        ci = round(c * scale)
        out.append(ci - prev)
        prev = ci
    return out


def build_stocks(n: int, rng: random.Random) -> list[dict]:
    if n <= 0:
        return []
    import yfinance as yf  # 延後 import，只跑幣圈時不需要

    tickers = [f"{t}.TW" for t in TW_TICKERS] + US_TICKERS
    log(f"stocks: downloading {len(tickers)} tickers, 10y daily")
    df = yf.download(tickers, period="10y", interval="1d", group_by="ticker", auto_adjust=True, progress=False, threads=True)

    raw: list[dict] = []
    per_ticker = math.ceil(n * 1.3 / len(tickers)) + 1
    for t in tickers:
        try:
            series = df[t]["Close"].dropna()
        except KeyError:
            continue
        closes_all = [float(x) for x in series.tolist()]
        if len(closes_all) < STOCK_LEN + 20:
            continue
        starts = list(range(0, len(closes_all) - STOCK_LEN))
        rng.shuffle(starts)
        taken = 0
        for s in starts:
            window = closes_all[s : s + STOCK_LEN]
            if any(c <= 0 for c in window):
                continue
            rets = [window[k] / window[k - 1] - 1 for k in range(1, len(window))]
            # 單日超過 35% 幾乎都是還原權值出錯，整段丟掉
            if any(abs(x) > 0.35 for x in rets):
                continue
            raw.append({"market": "TW" if t.endswith(".TW") else "US", "closes": window})
            taken += 1
            if taken >= per_ticker:
                break

    vols = [realized_vol(r["closes"]) for r in raw]
    segments = []
    for idx, (r, v) in enumerate(zip(raw, vols)):
        segments.append(
            {
                "id": f"stk_{idx + 1:04d}",
                "market": r["market"],
                "vol": vol_label(vols, v),
                "d": encode_closes(r["closes"]),
            }
        )
    rng.shuffle(segments)
    return segments[:n]


# ---------------- 主程式 ----------------


def write(path: Path, segments: list[dict]) -> None:
    payload = {
        "version": 1,
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "segments": segments,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    log(f"wrote {path} ({path.stat().st_size // 1024} KB, {len(segments)} segments)")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--crypto", type=int, default=500)
    ap.add_argument("--stocks", type=int, default=300)
    ap.add_argument("--seed", type=int, default=20260906)
    ap.add_argument("--interval", choices=list(INTERVAL_MS), default="1m", help="幣圈 K 線週期；拉長會放大每段的波動")
    ap.add_argument("--out", type=Path, default=Path("src/data"))
    args = ap.parse_args()

    rng = random.Random(args.seed)
    if args.crypto > 0:
        write(args.out / "crypto_segments.json", build_crypto(args.crypto, rng, args.interval))
    if args.stocks > 0:
        write(args.out / "stock_segments.json", build_stocks(args.stocks, rng))


if __name__ == "__main__":
    main()
