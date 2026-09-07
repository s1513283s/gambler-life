import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CONFIG } from '../../config';
import { formatMoney } from '../../engine/death';
import { forcedHandsLeft } from '../../engine/venueReducer';
import { useGame } from '../../store';
import type { BaccaratResult, BaccaratSession, BaccaratSide, Card } from '../../types';
import { canBetAt, minBetFor } from '../../venues/betting';
import { RANK_LABELS, SUIT_LABELS, isRed, rankOf, suitOf } from '../../venues/cards';
import { CHIP_DEFS, chipsFor, toneOf } from '../baccaratChips';
import { dealTimeline, timingFor, type DealTimeline, type Seat } from '../baccaratTimeline';
import { motionMs, useScene } from '../sceneStore';
import { playSound } from '../sound';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { Icon } from '../components/Icon';

/**
 * 百家樂全螢幕牌桌。狀態機仍在 reducer：BACCARAT_BET 扣注金並發完整手牌（pending），
 * 這裡只負責照 dealTimeline 排演發牌與翻牌，演完才送 BACCARAT_RESOLVE 派彩。
 * 重整時 pending 還在，會從頭重播一次再派彩。
 */

type Phase = 'bet' | 'deal' | 'settle';

const SIDE_LABEL: Record<BaccaratSide, string> = { banker: '莊', player: '閒', tie: '和' };
const SIDE_EN: Record<BaccaratSide, string> = { banker: 'BANKER', player: 'PLAYER', tie: 'TIE' };
const SIDE_ODDS: Record<BaccaratSide, string> = { banker: '1 : 0.95', player: '1 : 1', tie: '1 : 8' };
const ZONES: readonly BaccaratSide[] = ['player', 'tie', 'banker'];
const SEATS: readonly Seat[] = ['player', 'banker'];
const MAX_VISIBLE_CHIPS = 8;

interface Props {
  session: BaccaratSession;
}

export function BaccaratTable({ session }: Props) {
  const state = useGame((s) => s.state);
  const dispatch = useGame((s) => s.dispatch);
  const transitionTo = useScene((s) => s.transitionTo);

  const pending = session.pending;
  const result = session.lastResult;
  const vipMin = session.vip ? Math.min(CONFIG.VIP_MIN_BET, state.cash) : 0;
  const minBet = Math.max(minBetFor('baccarat', state.cash, state.tilt), vipMin);
  const affordable = canBetAt('baccarat', state.cash);
  const forced = forcedHandsLeft(state);

  const [settling, setSettling] = useState(false);
  const phase: Phase = pending !== null ? 'deal' : settling ? 'settle' : 'bet';
  const [side, setSide] = useState<BaccaratSide>(result?.side ?? 'banker');
  const [chips, setChips] = useState<number[]>(() => (pending !== null ? chipsFor(pending.stake) : []));
  const [lastStake, setLastStake] = useState(0);
  const [thump, setThump] = useState(0);
  const stake = chips.reduce((s, c) => s + c, 0);

  // ---- 發牌：pending 出現就照時間表排演，演完派彩 ----
  const timeline = pending !== null ? dealTimeline(pending.hand) : null;
  useEffect(() => {
    if (pending === null) return;
    const tl = dealTimeline(pending.hand);
    const cardTimers = tl.cards.map((c) => setTimeout(() => playSound('card'), motionMs(c.dealAt)));
    const done = setTimeout(() => {
      setSettling(true);
      dispatch({ type: 'BACCARAT_RESOLVE' });
    }, motionMs(tl.totalMs));
    return () => {
      cardTimers.forEach(clearTimeout);
      clearTimeout(done);
    };
  }, [pending, dispatch]);

  // ---- 派彩動畫停留，然後回到下注 ----
  useEffect(() => {
    if (phase !== 'settle') return;
    const timer = setTimeout(() => {
      setLastStake(stake);
      setChips([]);
      setSettling(false);
    }, motionMs(CONFIG.BACCARAT_SETTLE_MS));
    return () => clearTimeout(timer);
  }, [phase, stake]);

  const betting = phase === 'bet';
  const canLeave = betting && forced === 0;

  const addChip = (value: number) => {
    if (!betting) return;
    const room = state.cash - stake;
    if (room <= 0) return;
    setChips((c) => [...c, Math.min(value, room)]);
    setThump((t) => t + 1);
    playSound('chip');
  };
  const setAll = (amount: number) => {
    if (!betting) return;
    setChips(chipsFor(Math.min(amount, state.cash)));
    setThump((t) => t + 1);
    playSound('chip');
  };
  const clear = () => {
    if (!betting) return;
    setChips([]);
  };
  const deal = () => {
    if (!betting || stake < minBet || stake > state.cash) return;
    dispatch({ type: 'BACCARAT_BET', side, stake });
  };
  const leave = () => {
    if (!canLeave) return;
    transitionTo(() => dispatch({ type: 'LEAVE_VENUE' }));
  };

  // 目前桌上顯示的手牌：發牌中看 pending，其餘看上一局
  const shownHand = pending?.hand ?? result?.hand ?? null;
  const shownSide = betting ? side : (pending?.side ?? result?.side ?? side);
  const shownStake = betting ? stake : (pending?.stake ?? result?.stake ?? 0);
  const outcome = phase === 'settle' && result !== null ? result.hand.outcome : null;
  const net = phase === 'settle' && result !== null ? result.payout - result.stake : 0;
  const verdict: 'win' | 'lose' | 'push' | null = phase !== 'settle' || result === null ? null : net > 0 ? 'win' : net < 0 ? 'lose' : 'push';
  const stakeOk = stake >= minBet && stake <= state.cash && affordable;

  return (
    <main
      className={`table-scene scene-enter ${state.tilt ? 'table-tilt' : ''} ${session.vip ? 'table-scene-vip' : ''}`}
      style={{ '--settle-ms': `${motionMs(CONFIG.BACCARAT_SETTLE_MS)}ms` } as React.CSSProperties}
    >
      <header className="table-bar">
        <div className="table-cash">
          <span className="table-cash-label">
            <Icon name="cash" size={12} /> 現金
          </span>
          <span className="table-cash-value">
            <AnimatedNumber value={state.cash} prefix="$" />
          </span>
          <span className="table-session">
            {session.handsPlayed} 局 · {session.net >= 0 ? '+' : ''}
            {formatMoney(session.net)}
          </span>
        </div>
        <button className={`btn btn-small table-leave ${!canLeave && forced > 0 ? 'table-leave-locked' : ''}`} disabled={!canLeave} onClick={leave}>
          {forced > 0 ? (
            <>
              <span className="btn-title">你現在完全停不下來！</span>
              <span className="btn-sub">再玩 {forced} 局才走得了</span>
            </>
          ) : (
            '離開牌桌'
          )}
        </button>
      </header>

      <section className="felt-wrap">
        <div className="felt">
          {session.vip && <div className="felt-vip">VIP</div>}
          <div className="felt-logo" aria-hidden="true">
            BACCARAT
          </div>

          <Shoe />

          <div className="seats">
            {SEATS.map((seat) => (
              <SeatView
                key={seat}
                seat={seat}
                cards={shownHand === null ? [] : shownHand[seat]}
                total={shownHand === null ? null : seat === 'player' ? shownHand.playerTotal : shownHand.bankerTotal}
                timeline={timeline}
                dealing={phase === 'deal' && pending !== null}
                winner={outcome === seat}
              />
            ))}
          </div>

          {phase === 'settle' && result !== null && <ResultBanner result={result} />}

          <div className="zones">
            {ZONES.map((z) => {
              const active = shownSide === z && (shownStake > 0 || betting);
              const cls = [
                'zone',
                `zone-${z}`,
                active ? 'zone-active' : '',
                outcome === z ? 'zone-win' : '',
                outcome !== null && outcome !== z && shownSide === z ? 'zone-lost' : '',
              ].join(' ');
              return (
                <button key={z} className={cls} disabled={!betting} onClick={() => setSide(z)}>
                  <span className="zone-name">
                    {SIDE_LABEL[z]}
                    <small>{SIDE_EN[z]}</small>
                  </span>
                  <span className="zone-odds">{z === 'banker' && session.vip ? '1 : 0.975' : SIDE_ODDS[z]}</span>
                  {shownSide === z && shownStake > 0 && (
                    <>
                      <ChipStack chips={chips} className={verdict !== null ? `stack-${verdict}` : ''} thump={thump} />
                      {verdict === 'win' && <ChipStack chips={chipsFor(net)} className="stack-payout stack-win" thump={0} />}
                      <span className="zone-stake">${formatMoney(verdict === 'win' ? result!.payout : shownStake)}</span>
                    </>
                  )}
                  {active && betting && <span key={thump} className="zone-ring" aria-hidden="true" />}
                </button>
              );
            })}
          </div>

          <div className="road felt-road" aria-label="路單">
            {session.road.map((r, i) => (
              <span key={i} className={`bead bead-${r}`}>
                {SIDE_LABEL[r]}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="rail">
        <div className="rail-info">
          <span className="muted small">
            押{SIDE_LABEL[side]} · 最低 ${formatMoney(minBet)}
            {state.tilt ? '（上頭：現金 25%）' : ''}
            {session.vip ? ' · 抽水減半' : ''}
          </span>
          <span className={`rail-stake ${stake > 0 && !stakeOk ? 'danger' : ''}`}>${formatMoney(stake)}</span>
        </div>

        <div className="chip-tray">
          {CHIP_DEFS.map((c) => (
            <button key={c.value} className={`tray-chip ${c.tone}`} disabled={!betting || !affordable || stake >= state.cash} onClick={() => addChip(c.value)}>
              {c.label}
            </button>
          ))}
          <button className="tray-chip chip-max" disabled={!betting || !affordable} onClick={() => setAll(state.cash)}>
            MAX
          </button>
        </div>

        <div className="rail-actions">
          <button className="btn btn-small" disabled={!betting || stake === 0} onClick={clear}>
            清除
          </button>
          {minBet > CONFIG.BACCARAT_MIN_BET && (
            <button className="btn btn-small" disabled={!betting || !affordable} onClick={() => setAll(minBet)}>
              最低 ${formatMoney(minBet)}
            </button>
          )}
          {lastStake > 0 && lastStake <= state.cash && lastStake >= minBet && stake === 0 && (
            <button className="btn btn-small" disabled={!betting} onClick={() => setAll(lastStake)}>
              續押 ${formatMoney(lastStake)}
            </button>
          )}
          <button className="btn btn-primary btn-deal" disabled={!betting || !stakeOk} onClick={deal}>
            {!affordable ? '現金不足' : phase === 'deal' ? '發牌中…' : phase === 'settle' ? '派彩中…' : stake === 0 ? '放籌碼下注' : stake < minBet ? `最低 $${formatMoney(minBet)}` : `發牌 DEAL`}
          </button>
        </div>
      </section>
    </main>
  );
}

// ---------- 子元件 ----------

function Shoe() {
  return (
    <div className="shoe" data-shoe aria-hidden="true">
      <span className="shoe-card" />
      <span className="shoe-card" />
      <span className="shoe-card" />
      <span className="shoe-label">SHOE</span>
    </div>
  );
}

interface SeatProps {
  seat: Seat;
  cards: Card[];
  total: number | null;
  timeline: DealTimeline | null;
  dealing: boolean;
  winner: boolean;
}

function SeatView({ seat, cards, total, timeline, dealing, winner }: SeatProps) {
  const totalAt = timeline === null ? 0 : seat === 'player' ? timeline.playerTotalAt : timeline.bankerTotalAt;
  return (
    <div className={`seat seat-${seat} ${winner ? 'seat-winner' : ''}`}>
      <div className="seat-head">
        <span className="seat-name">
          {SIDE_LABEL[seat]} <small>{SIDE_EN[seat]}</small>
        </span>
        <span className={`seat-total ${dealing ? 'seat-total-reveal' : ''}`} style={dealing ? { animationDelay: `${motionMs(totalAt)}ms` } : undefined}>
          {total ?? ''}
        </span>
      </div>
      <div className="seat-cards">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`slot ${i === 2 ? 'slot-third' : ''}`} data-slot={`${seat}-${i}`}>
            {cards[i] !== undefined && <TableCard card={cards[i]} seat={seat} index={i} timeline={dealing ? timeline : null} />}
          </div>
        ))}
      </div>
    </div>
  );
}

interface CardProps {
  card: Card;
  seat: Seat;
  index: number;
  timeline: DealTimeline | null; // null = 靜態顯示
}

/** 一張牌：外層負責從牌靴滑到牌位，中層負責補牌橫置，內層負責 3D 翻面 */
function TableCard({ card, seat, index, timeline }: CardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState<{ dx: number; dy: number } | null>(null);
  const timing = timeline === null ? undefined : timingFor(timeline, seat, index);
  const animate = timing !== undefined;

  // 量牌靴到這個牌位的距離，讓滑出動畫從牌靴出發。layout effect 在繪製前跑，不會閃一格。
  useLayoutEffect(() => {
    if (!animate || ref.current === null) return;
    const shoe = ref.current.closest('.felt')?.querySelector('[data-shoe]');
    if (!shoe) return;
    const a = shoe.getBoundingClientRect();
    const b = ref.current.getBoundingClientRect();
    setOffset({ dx: a.left + a.width / 2 - (b.left + b.width / 2), dy: a.top + a.height / 2 - (b.top + b.height / 2) });
  }, [animate]);

  const style: React.CSSProperties | undefined =
    animate && offset !== null
      ? ({
          '--dx': `${offset.dx}px`,
          '--dy': `${offset.dy}px`,
          '--deal-delay': `${motionMs(timing.dealAt)}ms`,
          '--flip-delay': `${motionMs(timing.flipAt)}ms`,
          '--slide-ms': `${motionMs(CONFIG.BACCARAT_SLIDE_MS)}ms`,
          '--flip-ms': `${motionMs(CONFIG.BACCARAT_FLIP_MS)}ms`,
        } as React.CSSProperties)
      : undefined;

  const rank = RANK_LABELS[rankOf(card)];
  const suit = SUIT_LABELS[suitOf(card)];
  return (
    <div ref={ref} className={`tcard ${animate ? (offset === null ? 'tcard-pending' : 'tcard-dealing') : 'tcard-static'}`} style={style}>
      <div className="tcard-rot">
        <div className="tcard-inner">
          <div className="tcard-face tcard-back" />
          <div className={`tcard-face tcard-front ${isRed(card) ? 'card-red' : ''}`}>
            <span className="tcard-corner">
              {rank}
              <small>{suit}</small>
            </span>
            <span className="tcard-pip">{suit}</span>
            <span className="tcard-corner tcard-corner-b">
              {rank}
              <small>{suit}</small>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChipStack({ chips, className, thump }: { chips: number[]; className: string; thump: number }) {
  const visible = chips.slice(-MAX_VISIBLE_CHIPS);
  const hidden = chips.length - visible.length;
  return (
    <span className={`stack ${className}`} aria-hidden="true" data-thump={thump}>
      {visible.map((v, i) => (
        <span key={`${chips.length - visible.length + i}`} className={`stack-chip ${toneOf(v)}`} style={{ '--i': i + hidden } as React.CSSProperties} />
      ))}
    </span>
  );
}

function ResultBanner({ result }: { result: BaccaratResult }) {
  const net = result.payout - result.stake;
  const tone = net > 0 ? 'ok' : net < 0 ? 'danger' : 'muted';
  const h = result.hand;
  const outcome = h.outcome === 'tie' ? '和局' : `${SIDE_LABEL[h.outcome]}贏`;
  return (
    <div className={`result-banner ${tone}`}>
      <span className="result-banner-hands">
        閒 {h.playerTotal} <em>vs</em> 莊 {h.bankerTotal}
      </span>
      <span className="result-banner-outcome">{outcome}</span>
      <span className="result-banner-net">{net > 0 ? `+$${formatMoney(net)}` : net < 0 ? `−$${formatMoney(-net)}` : '退回本金'}</span>
    </div>
  );
}
