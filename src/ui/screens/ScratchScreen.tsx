import { CONFIG } from '../../config';
import { formatMoney } from '../../engine/death';
import { forcedHandsLeft } from '../../engine/venueReducer';
import { useGame } from '../../store';
import type { ScratchSession, ScratchTicket } from '../../types';
import { ScratchMask } from '../components/ScratchMask';
import { VenueFooter } from '../components/VenueFooter';

interface Props {
  session: ScratchSession;
}

export function ScratchScreen({ session }: Props) {
  const state = useGame((s) => s.state);
  const dispatch = useGame((s) => s.dispatch);
  const ticket = session.ticket;

  return (
    <main className="screen">
      <section className="ticket-area">
        {ticket !== null ? (
          <TicketCard ticket={ticket} onReveal={() => dispatch({ type: 'SCRATCH_REVEAL' })} maskKey={session.handsPlayed} />
        ) : (
          <LastResult ticket={session.lastTicket} />
        )}
      </section>

      <section className="card">
        <h2>買一張</h2>
        <div className="ticket-grid">
          {CONFIG.SCRATCH_TICKETS.map((t) => (
            <button
              key={t.price}
              className="btn btn-big"
              disabled={ticket !== null || state.cash < t.price}
              onClick={() => dispatch({ type: 'SCRATCH_BUY', price: t.price })}
            >
              <span className="btn-title">${formatMoney(t.price)}</span>
              <span className="btn-sub gold">頭獎 ${formatMoney(t.jackpot)}</span>
            </button>
          ))}
        </div>
        <p className="muted small">每張精神 -{CONFIG.SCRATCH_SANITY_COST}。回本率 {Math.round(CONFIG.SCRATCH_RTP * 100)}%。</p>
      </section>

      <VenueFooter
        handsPlayed={session.handsPlayed}
        net={session.net}
        forced={forcedHandsLeft(state)}
        canLeave={ticket === null}
        onLeave={() => dispatch({ type: 'LEAVE_VENUE' })}
      />
    </main>
  );
}

function prizeText(ticket: ScratchTicket): { text: string; tone: string } {
  if (ticket.prize === 0) return { text: '銘謝惠顧', tone: 'muted' };
  if (ticket.prize === ticket.price) return { text: `回本 $${formatMoney(ticket.prize)}`, tone: 'warn' };
  return { text: `$${formatMoney(ticket.prize)}`, tone: 'ok' };
}

function TicketCard({ ticket, onReveal, maskKey }: { ticket: ScratchTicket; onReveal: () => void; maskKey: number }) {
  const prize = prizeText(ticket);
  return (
    <div className="ticket">
      <div className="ticket-head">
        <span>${formatMoney(ticket.price)} 刮刮樂</span>
        <button className="chip" onClick={onReveal}>
          直接揭曉
        </button>
      </div>
      <div className="ticket-window">
        <div className={`ticket-prize ${prize.tone}`}>{prize.text}</div>
        <ScratchMask key={maskKey} onCleared={onReveal} />
      </div>
    </div>
  );
}

function LastResult({ ticket }: { ticket: ScratchTicket | null }) {
  if (ticket === null) return <div className="ticket ticket-empty muted">選一張面額開始</div>;
  const prize = prizeText(ticket);
  const net = ticket.prize - ticket.price;
  return (
    <div className="ticket">
      <div className="ticket-head">
        <span>${formatMoney(ticket.price)} 刮刮樂</span>
        <span className={net > 0 ? 'ok' : net < 0 ? 'danger' : 'muted'}>
          {net > 0 ? '+' : ''}
          {formatMoney(net)}
        </span>
      </div>
      <div className="ticket-window">
        <div className={`ticket-prize ${prize.tone}`}>{prize.text}</div>
      </div>
    </div>
  );
}
