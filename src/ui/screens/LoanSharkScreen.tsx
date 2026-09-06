import { CONFIG } from '../../config';
import { formatMoney } from '../../engine/death';
import { loanRoom, nightlyInterest } from '../../engine/economy';
import { useGame } from '../../store';

interface Props {
  onClose: () => void;
}

export function LoanSharkScreen({ onClose }: Props) {
  const state = useGame((s) => s.state);
  const dispatch = useGame((s) => s.dispatch);

  const room = loanRoom(state.debt);
  const borrowUnit = Math.min(CONFIG.LOAN_UNIT, room);
  const repayUnit = Math.min(CONFIG.LOAN_UNIT, state.cash, state.debt);
  const repayAll = Math.min(state.cash, state.debt);
  const tomorrow = state.debt + nightlyInterest(state.debt);

  return (
    <main className="screen">
      <section className="card">
        <h2>阿龍</h2>
        <div className="kv">
          <span className="muted">目前欠款</span>
          <span>${formatMoney(state.debt)}</span>
        </div>
        <div className="kv">
          <span className="muted">日息</span>
          <span>{(CONFIG.LOAN_DAILY_RATE * 100).toFixed(0)}%</span>
        </div>
        <div className="kv">
          <span className="muted">明早本利和</span>
          <span>${formatMoney(tomorrow)}</span>
        </div>
        <div className="kv">
          <span className="muted">還能借</span>
          <span>${formatMoney(room)}</span>
        </div>
        {state.debt > CONFIG.DEBT_HARASS_THRESHOLD && (
          <p className="danger">欠超過 ${formatMoney(CONFIG.DEBT_HARASS_THRESHOLD)}，每晚都會接到討債電話。</p>
        )}
      </section>

      <div className="action-grid">
        <button
          className="btn btn-big"
          disabled={borrowUnit <= 0}
          onClick={() => dispatch({ type: 'BORROW', amount: borrowUnit })}
        >
          <span className="btn-title">借</span>
          <span className="btn-sub">${formatMoney(borrowUnit)}</span>
        </button>
        <button className="btn btn-big" disabled={room <= 0} onClick={() => dispatch({ type: 'BORROW', amount: room })}>
          <span className="btn-title">借滿</span>
          <span className="btn-sub">${formatMoney(room)}</span>
        </button>
        <button
          className="btn btn-big"
          disabled={repayUnit <= 0}
          onClick={() => dispatch({ type: 'REPAY', amount: repayUnit })}
        >
          <span className="btn-title">還</span>
          <span className="btn-sub">${formatMoney(repayUnit)}</span>
        </button>
        <button
          className="btn btn-big"
          disabled={repayAll <= 0}
          onClick={() => dispatch({ type: 'REPAY', amount: repayAll })}
        >
          <span className="btn-title">還清</span>
          <span className="btn-sub">${formatMoney(repayAll)}</span>
        </button>
      </div>

      <div className="spacer" />
      <button className="btn" onClick={onClose}>
        離開
      </button>
    </main>
  );
}
