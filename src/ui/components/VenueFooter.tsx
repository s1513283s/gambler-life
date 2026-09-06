import { formatMoney } from '../../engine/death';

interface Props {
  handsPlayed: number;
  net: number;
  forced: number; // 上頭強制局數剩餘
  canLeave: boolean; // 沒有進行中的局
  onLeave: () => void;
  extra?: string; // 場子專屬的一行小字
}

export function VenueFooter({ handsPlayed, net, forced, canLeave, onLeave, extra }: Props) {
  return (
    <div className="venue-footer">
      <span className="muted small">
        本次 {handsPlayed} 局，{net >= 0 ? '+' : ''}
        {formatMoney(net)}
        {extra ? ` · ${extra}` : ''}
      </span>
      <button className="btn btn-small" disabled={!canLeave || forced > 0} onClick={onLeave}>
        {forced > 0 ? `上頭中，再玩 ${forced} 局` : '離開'}
      </button>
    </div>
  );
}
