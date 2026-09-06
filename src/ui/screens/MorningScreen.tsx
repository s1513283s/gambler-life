import { formatMoney } from '../../engine/death';
import { useGame } from '../../store';

export function MorningScreen() {
  const state = useGame((s) => s.state);
  const dispatch = useGame((s) => s.dispatch);

  return (
    <main className="screen">
      <div className="sky sky-morning" aria-hidden="true">
        <div className="sun" />
      </div>
      <section className="card">
        <h2>早上</h2>
        <p className="big day-title">第 {state.day} 天</p>
        <p>今天要付 ${formatMoney(state.dailyExpense)}。</p>
        {state.debt > 0 && <p className="warn">阿龍那邊還欠 ${formatMoney(state.debt)}。</p>}
        {state.day <= state.workBlockedUntilDay && <p className="warn">身體還沒好，今天打不了工。</p>}
        {state.insiderTipDay === state.day && <p className="ok">朋友說今天 NBA 有一場內線。</p>}
        {state.tilt && <p className="danger shake">你有點上頭。</p>}
      </section>
      <div className="spacer" />
      <button className="btn btn-primary" onClick={() => dispatch({ type: 'START_DAY' })}>
        開始今天
      </button>
    </main>
  );
}
