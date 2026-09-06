import { formatMoney } from '../../engine/death';
import { clampStake } from '../../venues/betting';

interface Props {
  min: number;
  cash: number;
  value: number;
  tilt: boolean;
  disabled: boolean;
  onChange: (stake: number) => void;
}

/** 注碼滑桿加快捷籌碼。value 由呼叫端先用 clampStake 夾好。 */
export function StakeControl({ min, cash, value, tilt, disabled, onChange }: Props) {
  const pick = (v: number) => onChange(clampStake(v, min, cash));
  return (
    <section className="card stake-card">
      <div className="kv">
        <span className="muted">注碼{tilt ? '（上頭，最低 25% 現金）' : ''}</span>
        <span className="big">${formatMoney(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={Math.max(cash, min)}
        step={100}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="chip-row">
        <button className="chip" disabled={disabled} onClick={() => pick(min)}>最低</button>
        <button className="chip" disabled={disabled} onClick={() => pick(1000)}>1,000</button>
        <button className="chip" disabled={disabled} onClick={() => pick(5000)}>5,000</button>
        <button className="chip" disabled={disabled} onClick={() => pick(Math.floor(cash / 2))}>一半</button>
        <button className="chip" disabled={disabled} onClick={() => pick(cash)}>全下</button>
      </div>
    </section>
  );
}
