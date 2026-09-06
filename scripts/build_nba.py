"""
把 kyleskom/NBA-Machine-Learning-Sports-Betting 的 OddsData.sqlite 轉成遊戲用的 nba_games.json。

    python scripts/build_nba.py                       # 預設三季
    python scripts/build_nba.py --seasons 2023-24     # 指定季
    python scripts/build_nba.py --sqlite path/to/OddsData.sqlite

來源欄位：Date, Home, Away, OU, Spread, ML_Home, ML_Away, Points, Win_Margin
  Spread 是「主隊讓幾分」（正 = 主隊為熱門），遊戲用的 home line = -Spread。
  ML 是美式賠率，轉成十進位。讓分與大小分沒有價格，一律 -110（1.91）。
  Points = 兩隊總分，Win_Margin = 主隊 - 客隊，反推兩隊比分。

輸出格式（緊湊陣列）：
  { version: 1, generated, teams: [中文隊名...],
    days: [ [ [home, away, mlHome, mlAway, spread2, total2, homeScore, awayScore], ... ], ... ] }
  mlHome / mlAway 是十進位賠率 x1000 的整數；spread2 / total2 是盤口 x2 的整數。
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

SQLITE_URL = "https://raw.githubusercontent.com/kyleskom/NBA-Machine-Learning-Sports-Betting/master/Data/OddsData.sqlite"
DEFAULT_SEASONS = ["2022-23", "2023-24", "2024-25"]

TEAM_ZH = {
    "Atlanta Hawks": "老鷹", "Boston Celtics": "塞爾提克", "Brooklyn Nets": "籃網", "Charlotte Hornets": "黃蜂",
    "Chicago Bulls": "公牛", "Cleveland Cavaliers": "騎士", "Dallas Mavericks": "獨行俠", "Denver Nuggets": "金塊",
    "Detroit Pistons": "活塞", "Golden State Warriors": "勇士", "Houston Rockets": "火箭", "Indiana Pacers": "溜馬",
    "LA Clippers": "快艇", "Los Angeles Clippers": "快艇", "Los Angeles Lakers": "湖人", "Memphis Grizzlies": "灰熊",
    "Miami Heat": "熱火", "Milwaukee Bucks": "公鹿", "Minnesota Timberwolves": "灰狼", "New Orleans Pelicans": "鵜鶘",
    "New York Knicks": "尼克", "Oklahoma City Thunder": "雷霆", "Orlando Magic": "魔術", "Philadelphia 76ers": "76人",
    "Phoenix Suns": "太陽", "Portland Trail Blazers": "拓荒者", "Sacramento Kings": "國王", "San Antonio Spurs": "馬刺",
    "Toronto Raptors": "暴龍", "Utah Jazz": "爵士", "Washington Wizards": "巫師",
    # 舊隊名偶爾混進資料
    "Charlotte Bobcats": "黃蜂", "New Jersey Nets": "籃網", "New Orleans Hornets": "鵜鶘", "Seattle SuperSonics": "雷霆",
}


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def american_to_decimal(ml: float) -> float:
    return 1 + ml / 100 if ml > 0 else 1 + 100 / abs(ml)


def table_for(con: sqlite3.Connection, season: str) -> str:
    names = [r[0] for r in con.execute("select name from sqlite_master where type='table'")]
    for cand in (f"odds_{season}_new", season, f"odds_{season}"):
        if cand in names:
            return cand
    raise SystemExit(f"season {season} not in sqlite: {names}")


def load_season(con: sqlite3.Connection, season: str, teams: list[str]) -> list[list[list[int]]]:
    table = table_for(con, season)
    rows = con.execute(f'select Date, Home, Away, OU, Spread, ML_Home, ML_Away, Points, Win_Margin from "{table}" order by Date').fetchall()
    days: dict[str, list[list[int]]] = {}
    skipped = 0
    agree = 0
    for date, home, away, ou, spread, ml_home, ml_away, points, margin in rows:
        try:
            ou_f, sp_f, mh, ma, pts, wm = float(ou), float(spread), float(ml_home), float(ml_away), int(points), int(margin)
        except (TypeError, ValueError):
            skipped += 1
            continue
        if home not in TEAM_ZH or away not in TEAM_ZH or home == away or ou_f <= 0 or mh == 0 or ma == 0 or (pts + wm) % 2 != 0:
            skipped += 1
            continue
        if (sp_f > 0) == (mh < 0):
            agree += 1
        home_score = (pts + wm) // 2
        away_score = (pts - wm) // 2
        if home_score < 0 or away_score < 0:
            skipped += 1
            continue
        for t in (TEAM_ZH[home], TEAM_ZH[away]):
            if t not in teams:
                teams.append(t)
        days.setdefault(date, []).append(
            [
                teams.index(TEAM_ZH[home]),
                teams.index(TEAM_ZH[away]),
                round(american_to_decimal(mh) * 1000),
                round(american_to_decimal(ma) * 1000),
                round(-sp_f * 2),
                round(ou_f * 2),
                home_score,
                away_score,
            ]
        )
    total = len(rows) - skipped
    log(f"{season}: {total} games, {len(days)} days, skipped {skipped}, spread/ml sign agreement {agree / max(total, 1):.0%}")
    if total and agree / total < 0.9:
        raise SystemExit("spread sign convention looks wrong, check the source")
    return [days[d] for d in sorted(days)]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seasons", nargs="+", default=DEFAULT_SEASONS)
    ap.add_argument("--sqlite", type=Path, default=Path("scripts/.cache/OddsData.sqlite"))
    ap.add_argument("--out", type=Path, default=Path("src/data/nba_games.json"))
    args = ap.parse_args()

    if not args.sqlite.exists():
        args.sqlite.parent.mkdir(parents=True, exist_ok=True)
        log(f"downloading {SQLITE_URL}")
        urllib.request.urlretrieve(SQLITE_URL, args.sqlite)

    con = sqlite3.connect(args.sqlite)
    teams: list[str] = []
    days: list[list[list[int]]] = []
    for season in args.seasons:
        days.extend(load_season(con, season, teams))

    payload = {
        "version": 1,
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "seasons": args.seasons,
        "teams": teams,
        "days": days,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    log(f"wrote {args.out} ({args.out.stat().st_size // 1024} KB, {len(days)} game days, {sum(len(d) for d in days)} games)")


if __name__ == "__main__":
    main()
