import { useState } from 'react';
import { CONFIG } from '../../config';
import { formatMoney } from '../../engine/death';
import { useGame } from '../../store';
import type { StockPosition } from '../../types';
import { clampStake } from '../../venues/betting';
import { positionValue, priceAt, toDollars, unrealizedPct } from '../../venues/stocks';
import { StakeControl } from './StakeControl';

interface Props {
  /** true = 只能賣（NIGHT 砍倉步驟） */
  sellOnly: boolean;
}

/** 五支股票卡片。點開一張展開買賣控制。 */
export function StockList({ sellOnly }: Props) {
  const state = useGame((s) => s.state);
  const dispatch = useGame((s) => s.dispatch);
  const [open, setOpen] = useState<number | null>(null);
  const [wantedAmount, setAmount] = useState<number>(CONFIG.STOCK_MIN_LOT);
  const market = state.stockMarket;
  if (market === null) return <p className="muted">載入市場中…</p>;

  const amount = clampStake(wantedAmount, CONFIG.STOCK_MIN_LOT, state.cash);
  const canBuy = !sellOnly && state.cash >= CONFIG.STOCK_MIN_LOT;

  return (
    <div className="stock-list">
      {market.map((slot, i) => {
        const pos = state.stockPositions.find((p) => p.slot === i);
        if (sellOnly && pos === undefined) return null;
        const price = priceAt(slot, state.stockDayIndex);
        const prev = priceAt(slot, state.stockDayIndex - 1);
        const change = price / prev - 1;
        const expanded = open === i;
        return (
          <section key={i} className={`card stock-card ${expanded ? 'stock-open' : ''}`}>
            <button className="stock-head" onClick={() => setOpen(expanded ? null : i)}>
              <div className="stock-title">
                <span className="stock-name">{slot.name}</span>
                <span className={`small ${change >= 0 ? 'ok' : 'danger'}`}>
                  {change >= 0 ? '+' : ''}
                  {(change * 100).toFixed(2)}%
                </span>
              </div>
              <Sparkline closes={slot.closes} end={state.stockDayIndex} />
              <div className="stock-price">
                <span>${toDollars(price).toFixed(2)}</span>
                {pos !== undefined && <PositionLine pos={pos} price={price} />}
              </div>
            </button>

            {expanded && (
              <div className="stock-actions">
                {pos !== undefined && (
                  <div className="action-grid">
                    <button className="btn" onClick={() => dispatch({ type: 'STOCK_SELL', slot: i, fraction: 0.5 })}>
                      賣一半
                    </button>
                    <button className="btn" onClick={() => dispatch({ type: 'STOCK_SELL', slot: i, fraction: 1 })}>
                      全賣
                    </button>
                  </div>
                )}
                {!sellOnly && (
                  <>
                    <StakeControl min={CONFIG.STOCK_MIN_LOT} cash={state.cash} value={amount} tilt={false} disabled={!canBuy} onChange={setAmount} />
                    <button className="btn btn-primary" disabled={!canBuy} onClick={() => dispatch({ type: 'STOCK_BUY', slot: i, amount })}>
                      {canBuy ? `買進 $${formatMoney(amount)}` : '現金不足'}
                    </button>
                  </>
                )}
                <p className="muted small">
                  買賣手續費各 {(CONFIG.STOCK_FEE * 100).toFixed(4)}%，賣出證交稅 {(CONFIG.STOCK_TAX * 100).toFixed(1)}%，每筆精神 -{CONFIG.STOCK_TRADE_SANITY_COST}。
                </p>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function PositionLine({ pos, price }: { pos: StockPosition; price: number }) {
  const pct = unrealizedPct(pos, price);
  return (
    <span className={`small ${pct >= 0 ? 'ok' : 'danger'}`}>
      持 ${formatMoney(positionValue(pos, price))} ({pct >= 0 ? '+' : ''}
      {(pct * 100).toFixed(1)}%)
    </span>
  );
}

/** 過去 20 天的走勢，SVG 折線。 */
function Sparkline({ closes, end }: { closes: readonly number[]; end: number }) {
  const start = Math.max(0, end - CONFIG.STOCK_VISIBLE_HISTORY + 1);
  const pts = closes.slice(start, end + 1);
  const lo = Math.min(...pts);
  const hi = Math.max(...pts);
  const w = 90;
  const h = 32;
  const x = (i: number) => (i / Math.max(1, pts.length - 1)) * w;
  const y = (v: number) => (hi === lo ? h / 2 : h - ((v - lo) / (hi - lo)) * h);
  const d = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const up = pts[pts.length - 1] >= pts[0];
  return (
    <svg className="sparkline" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={d} fill="none" stroke={up ? '#4ade80' : '#f87171'} strokeWidth="1.5" />
    </svg>
  );
}
