import { useEffect, useMemo, useState } from 'react';
import { CONFIG } from '../../config';
import { loadCryptoSegments } from '../../data/loaders';
import type { CryptoSegment } from '../../data/schema';
import { formatMoney } from '../../engine/death';
import { forcedHandsLeft } from '../../engine/venueReducer';
import { useGame } from '../../store';
import type { CryptoDirection, CryptoExitReason, CryptoSession } from '../../types';
import { canBetAt, clampStake, minBetFor } from '../../venues/betting';
import { grossPnl, liquidationPrice, roiPrice } from '../../venues/crypto';
import { CandleChart } from '../components/CandleChart';
import { StakeControl } from '../components/StakeControl';
import { VenueFooter } from '../components/VenueFooter';

const REASON_LABEL: Record<CryptoExitReason, string> = {
  closed: '手動平倉',
  tp: '停利觸發',
  sl: '停損觸發',
  liquidated: '爆倉',
  expired: '時間到，自動平倉',
};

interface Props {
  session: CryptoSession;
}

export function CryptoScreen({ session }: Props) {
  const state = useGame((s) => s.state);
  const dispatch = useGame((s) => s.dispatch);

  const [pool, setPool] = useState<readonly CryptoSegment[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [direction, setDirection] = useState<CryptoDirection>('long');
  const [leverage, setLeverage] = useState<number>(CONFIG.CRYPTO_DEFAULT_LEVERAGE);
  const [wantedMargin, setMargin] = useState<number>(CONFIG.CRYPTO_MIN_MARGIN);
  const [tp, setTp] = useState<number | null>(null);
  const [sl, setSl] = useState<number | null>(null);

  const minMargin = minBetFor('crypto', state.cash, state.tilt);
  const margin = clampStake(wantedMargin, minMargin, state.cash);
  const segment = session.segment;
  const position = session.position;

  // 載資料池。session 沒有切片時（剛進場或上一段結束後按了再開）抽一段。
  useEffect(() => {
    loadCryptoSegments().then(setPool, () => setLoadError(true));
  }, []);
  useEffect(() => {
    if (pool !== null && segment === null) dispatch({ type: 'CRYPTO_NEW_SEGMENT', pool });
  }, [pool, segment, dispatch]);

  // 播放：playing 期間固定頻率 TICK。重整後 playing 仍為 true，會自動續播。
  useEffect(() => {
    if (!session.playing) return;
    const timer = setInterval(() => dispatch({ type: 'CRYPTO_TICK' }), 1000 / CONFIG.CRYPTO_CANDLES_PER_SECOND);
    return () => clearInterval(timer);
  }, [session.playing, dispatch]);

  const lines = useMemo(() => {
    if (position === null) return [];
    const out = [
      { price: position.entryPrice, color: '#e5e7eb', label: '進場' },
      { price: liquidationPrice(position), color: '#f87171', label: '爆倉' },
    ];
    if (position.takeProfitPct !== null) out.push({ price: roiPrice(position, position.takeProfitPct), color: '#4ade80', label: '停利' });
    if (position.stopLossPct !== null) out.push({ price: roiPrice(position, -position.stopLossPct), color: '#fbbf24', label: '停損' });
    return out;
  }, [position]);

  const currentPrice = segment !== null ? segment.candles[session.cursor][3] : null;
  const unrealized = position !== null && currentPrice !== null ? grossPnl(position, currentPrice) : null;
  const affordable = canBetAt('crypto', state.cash);
  const canConfigure = segment !== null && position === null && !session.roundDone;

  return (
    <main className="screen">
      {/* 爆倉紅閃：CSS 動畫播完停在透明，key 讓每次爆倉都重播 */}
      {session.roundDone && session.lastResult?.reason === 'liquidated' && (
        <div className="liq-flash" key={session.handsPlayed}>
          爆倉
        </div>
      )}

      <section className="chart-card">
        <div className="chart-head">
          <span className="muted small">{segment !== null ? `${segment.symbol.slice(0, 1)}幣 · 1 分 K` : loadError ? '資料載入失敗' : '載入中…'}</span>
          <span className="small">{currentPrice !== null ? (currentPrice / 100).toFixed(2) : ''}</span>
        </div>
        {segment !== null && <CandleChart candles={segment.candles} cursor={session.cursor} slots={segment.candles.length} lines={lines} />}
        {position !== null && unrealized !== null && (
          <div className={`pnl-float ${unrealized >= 0 ? 'ok' : 'danger'}`}>
            {unrealized >= 0 ? '+' : ''}
            {formatMoney(unrealized)}
            <small> ({((unrealized / position.margin) * 100).toFixed(0)}%)</small>
          </div>
        )}
        {session.roundDone && session.lastResult !== null && (
          <div className={`result-line ${session.lastResult.pnl > 0 ? 'ok' : session.lastResult.pnl < 0 ? 'danger' : 'muted'}`}>
            {REASON_LABEL[session.lastResult.reason]} · {session.lastResult.pnl > 0 ? '+' : ''}
            {formatMoney(session.lastResult.pnl)}
          </div>
        )}
      </section>

      {position !== null && (
        <button className="btn btn-primary" onClick={() => dispatch({ type: 'CRYPTO_CLOSE' })}>
          平倉
        </button>
      )}

      {session.roundDone && (
        <button className="btn btn-primary" disabled={pool === null || !affordable} onClick={() => pool !== null && dispatch({ type: 'CRYPTO_NEW_SEGMENT', pool })}>
          再開一段
        </button>
      )}

      {canConfigure && (
        <>
          <section className="card meme-card">
            <div className="hero-row">
              <div>
                <div className="shop-name">土狗幣</div>
                <div className="muted small">{Math.round((1 - CONFIG.MEME_MOON_P) * 100)}% 歸零、{Math.round(CONFIG.MEME_MOON_P * 100)}% 十倍。即時開獎。</div>
              </div>
              <button className="btn btn-small" disabled={state.cash < CONFIG.MEME_MIN} onClick={() => dispatch({ type: 'CRYPTO_MEME', stake: Math.max(CONFIG.MEME_MIN, Math.min(margin, state.cash)) })}>
                梭 ${formatMoney(Math.max(CONFIG.MEME_MIN, Math.min(margin, state.cash)))}
              </button>
            </div>
            {session.lastMeme !== null && (
              <p className={session.lastMeme.moon ? 'ok big' : 'danger'}>
                {session.lastMeme.moon ? `噴了！+${formatMoney(session.lastMeme.payout - session.lastMeme.stake)}` : `歸零。-${formatMoney(session.lastMeme.stake)}`}
              </p>
            )}
          </section>
          <div className="side-grid two">
            <button className={`btn side-btn ${direction === 'long' ? 'side-active' : ''}`} onClick={() => setDirection('long')}>
              <span className="btn-title ok">做多</span>
            </button>
            <button className={`btn side-btn ${direction === 'short' ? 'side-active' : ''}`} onClick={() => setDirection('short')}>
              <span className="btn-title danger">做空</span>
            </button>
          </div>

          <section className="card">
            <div className="kv">
              <span className="muted">槓桿</span>
              <span className="big">{leverage}x</span>
            </div>
            <input type="range" min={1} max={CONFIG.CRYPTO_MAX_LEVERAGE} step={1} value={leverage} onChange={(e) => setLeverage(Number(e.target.value))} />
            <div className="chip-row">
              {CONFIG.CRYPTO_LEVERAGE_PRESETS.map((l) => (
                <button key={l} className={`chip ${leverage === l ? 'chip-active' : ''}`} onClick={() => setLeverage(l)}>
                  {l}x
                </button>
              ))}
            </div>
            <div className="kv small muted">
              <span>逆向 {(CONFIG.LIQ_RATIO / leverage * 100).toFixed(2)}% 爆倉</span>
              <span>來回手續費約 {((2 * CONFIG.CRYPTO_FEE + CONFIG.CRYPTO_SLIPPAGE) * leverage * 100).toFixed(1)}% 保證金</span>
            </div>
          </section>

          <StakeControl min={minMargin} cash={state.cash} value={margin} tilt={state.tilt} disabled={!affordable} onChange={setMargin} />

          <section className="card">
            <div className="tpsl-row">
              <span className="muted small">停利</span>
              <OptionChips options={CONFIG.CRYPTO_TP_OPTIONS} value={tp} onChange={setTp} prefix="+" />
            </div>
            <div className="tpsl-row">
              <span className="muted small">停損</span>
              <OptionChips options={CONFIG.CRYPTO_SL_OPTIONS} value={sl} onChange={setSl} prefix="-" />
            </div>
          </section>

          <button
            className="btn btn-primary"
            disabled={!affordable}
            onClick={() => dispatch({ type: 'CRYPTO_OPEN', direction, leverage, margin, takeProfitPct: tp, stopLossPct: sl })}
          >
            {affordable ? `${direction === 'long' ? '做多' : '做空'} ${leverage}x · 保證金 $${formatMoney(margin)}` : '現金不足'}
          </button>
        </>
      )}

      <VenueFooter
        handsPlayed={session.handsPlayed}
        net={session.net}
        forced={forcedHandsLeft(state)}
        canLeave={position === null}
        onLeave={() => dispatch({ type: 'LEAVE_VENUE' })}
      />
    </main>
  );
}

function OptionChips({ options, value, onChange, prefix }: { options: readonly number[]; value: number | null; onChange: (v: number | null) => void; prefix: string }) {
  return (
    <div className="chip-row">
      <button className={`chip ${value === null ? 'chip-active' : ''}`} onClick={() => onChange(null)}>
        不設
      </button>
      {options.map((o) => (
        <button key={o} className={`chip ${value === o ? 'chip-active' : ''}`} onClick={() => onChange(o)}>
          {prefix}
          {o}%
        </button>
      ))}
    </div>
  );
}
