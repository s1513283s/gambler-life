# 賭徒人生（快轉模式）

每天要付開銷，可以打工也可以賭。看你能活幾天。

純前端單頁遊戲：React + Vite + TypeScript，無後端，存檔在 localStorage。七個場子全部用真實歷史資料切片，每個場子的 EV 都是真的，死亡卡片會把你送給莊家的 EV 攤開。

## 玩法

- 開局選背景：一般人、富二代、月光族、工程師，各是一種解法。
- 每日挑戰：日期當 seed，全世界同一局，排行榜有獨立分頁。
- 解鎖制：開局只有合法的刮刮樂、幣圈、股票、運彩；第一次向阿龍借錢開百家樂與 21 點；累計借款或在地下場輸夠多開骰寶、妞妞、射龍門。
- 阿龍三段升級：欠超過討債線每晚扣精神；欠超過派人線明天不能打工；借滿七晚不降就被帶走。

## 開發

```
npm install
npm run dev -- --host     # 手機同網段可連
npm test                  # vitest
npm run sim               # 無頭模擬器，各策略 1000 局
npm run build             # 先驗資料再 tsc 再 vite build
npm run preview
```

## 資料

```
npm run data              # 幣圈 1 分 K + 股票日線切片（Binance 公開 API + yfinance）
npm run data -- --interval 5m --stocks 0   # 只重抓幣圈，改用 5 分 K
npm run data:nba          # NBA 三季盤口與比分（自動下載 OddsData.sqlite）
npm run validate-data
```

所有數值在 `src/config.ts`，調平衡改那裡。改了資料格式要升 `SAVE_VERSION`。

## 部署

Vercel：匯入這個 repo，framework 選 Vite，零設定。

GitHub Pages：

```
BASE_PATH=/gambler-life/ npm run build
```

把 `dist` 推到 gh-pages 分支。

## 結構

- `src/engine/` 純函數狀態機。`reducer.ts` 是入口，各場子的轉換在 `venueReducer.ts`、`cryptoReducer.ts`、`stockReducer.ts`、`nbaReducer.ts`。
- `src/venues/` 各場子的規則引擎，不碰狀態。
- `src/data/` 資料格式、驗證、動態載入。
- `src/sim/` 無頭模擬器與策略機器人。
- `src/ui/` 畫面。所有動畫都從狀態推導，重整後從同一狀態續玩。
- `src/analytics/` 排行榜與 run 紀錄。標題點五下可匯出。
- `scripts/` 資料前處理與 build 前驗證。
