import { useState } from 'react';
import { CONFIG } from '../../config';
import { formatMoney } from '../../engine/death';
import { PURCHASES } from '../../engine/richReducer';
import { isUnlocked } from '../../engine/unlocks';
import { useGame } from '../../store';
import type { PurchaseId } from '../../types';
import { clampStake } from '../../venues/betting';
import { Icon } from '../components/Icon';
import { StakeControl } from '../components/StakeControl';

interface Props {
  onClose: () => void;
}

/** 錢的用途：一次性消費，以及第三層解鎖後的三種投資部位。 */
export function ShopScreen({ onClose }: Props) {
  const state = useGame((s) => s.state);
  const dispatch = useGame((s) => s.dispatch);
  const rich = isUnlocked(state, 'lending');
  const [lendWanted, setLendWanted] = useState<number>(CONFIG.LEND_MIN);
  const [presaleWanted, setPresaleWanted] = useState<number>(CONFIG.PRESALE_MIN);
  const lendAmount = clampStake(lendWanted, CONFIG.LEND_MIN, state.cash);
  const presaleAmount = clampStake(presaleWanted, CONFIG.PRESALE_MIN, state.cash);

  const owned = (id: PurchaseId) => state.purchases.includes(id);

  return (
    <main className="screen">
      <section className="card">
        <h2>錢的用途</h2>
        <p className="muted small">每樣只能買一次。買了就印在死亡卡片上。</p>
      </section>

      <div className="shop-list">
        {PURCHASES.map((p) => {
          const has = owned(p.id);
          const affordable = state.cash >= p.price;
          const hidden = p.id === 'buyout' && state.loanSharkGone;
          if (hidden) return null;
          return (
            <section key={p.id} className={`card shop-item ${has ? 'shop-owned' : ''}`}>
              <div className="shop-row">
                <div>
                  <div className="shop-name">{p.name}</div>
                  <div className="muted small">{p.blurb}</div>
                </div>
                <button className="btn btn-small" disabled={has || !affordable} onClick={() => dispatch({ type: 'BUY_ITEM', item: p.id })}>
                  {has ? '已買' : `$${formatMoney(p.price)}`}
                </button>
              </div>
            </section>
          );
        })}
      </div>

      <section className="card">
        <div className="hero-row">
          <h2>有錢人的玩法</h2>
          {!rich && (
            <span className="badge badge-dim">
              <Icon name="lock" size={12} /> 淨值峰值 ${formatMoney(CONFIG.RICH_TIER_NET_WORTH)} 解鎖
            </span>
          )}
        </div>
        {!rich && <p className="muted small">放高利貸、代操別人的錢、炒預售屋。要先讓西裝男注意到你。</p>}
      </section>

      {rich && (
        <>
          <section className="card rich-card">
            <h2>放高利貸</h2>
            <p className="muted small">
              日息 {CONFIG.LEND_RATE * 100}% 滾進本金，每晚 {CONFIG.LEND_DEFAULT_RATE * 100}% 機率對方跑路歸零。換你當阿龍，這是全遊戲唯一正期望值的東西。
            </p>
            {state.lends.map((l, i) => (
              <div key={i} className="kv">
                <span>
                  第 {l.startDay} 天放出 · 現在 <span className="gold">${formatMoney(l.principal)}</span>
                </span>
                <button className="btn btn-small" onClick={() => dispatch({ type: 'COLLECT_LEND', index: i })}>
                  收回
                </button>
              </div>
            ))}
            <StakeControl min={CONFIG.LEND_MIN} cash={state.cash} value={lendAmount} tilt={false} disabled={state.cash < CONFIG.LEND_MIN} onChange={setLendWanted} />
            <button className="btn" disabled={state.cash < CONFIG.LEND_MIN} onClick={() => dispatch({ type: 'LEND', amount: lendAmount })}>
              放出 ${formatMoney(lendAmount)}
            </button>
          </section>

          <section className="card rich-card">
            <h2>代操別人的錢</h2>
            <p className="muted small">
              接管 ${formatMoney(CONFIG.MANAGE_PRINCIPAL)}，{CONFIG.MANAGE_DAYS} 天後要還本金，賺的你分 {CONFIG.MANAGE_SHARE * 100}%。到期時現金不夠還本金，金主會來找你。
            </p>
            {state.managed !== null ? (
              <p className="warn">
                手上有金主的 ${formatMoney(state.managed.principal)}，第 {state.managed.dueDay} 天到期。
              </p>
            ) : (
              <button className="btn" onClick={() => dispatch({ type: 'ACCEPT_MANAGE' })}>
                接 ${formatMoney(CONFIG.MANAGE_PRINCIPAL)}
              </button>
            )}
          </section>

          <section className="card rich-card">
            <h2>炒預售屋</h2>
            <p className="muted small">
              頭期款壓 {CONFIG.PRESALE_DAYS} 天，權益每晚變動 {CONFIG.PRESALE_MOVE_MIN * 100}% 到 {CONFIG.PRESALE_MOVE_MAX * 100}%，跌到頭期款的 {CONFIG.PRESALE_MARGIN_CALL * 100}% 就斷頭。隨時可以賣。
            </p>
            {state.property !== null ? (
              <>
                <div className="kv">
                  <span className="muted">頭期 ${formatMoney(state.property.downPayment)}</span>
                  <span className={state.property.equity >= state.property.downPayment ? 'ok' : 'danger'}>權益 ${formatMoney(state.property.equity)}</span>
                </div>
                <button className="btn" onClick={() => dispatch({ type: 'SELL_PRESALE' })}>
                  賣掉，拿回 ${formatMoney(state.property.equity)}
                </button>
              </>
            ) : (
              <>
                <StakeControl
                  min={CONFIG.PRESALE_MIN}
                  cash={state.cash}
                  value={presaleAmount}
                  tilt={false}
                  disabled={state.cash < CONFIG.PRESALE_MIN}
                  onChange={setPresaleWanted}
                />
                <button className="btn" disabled={state.cash < CONFIG.PRESALE_MIN} onClick={() => dispatch({ type: 'BUY_PRESALE', amount: presaleAmount })}>
                  付頭期款 ${formatMoney(presaleAmount)}
                </button>
              </>
            )}
          </section>
        </>
      )}

      <div className="spacer" />
      <button className="btn" onClick={onClose}>
        離開
      </button>
    </main>
  );
}
