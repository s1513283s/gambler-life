import { browserStore, loadLeaderboard } from '../../analytics/runlog';
import { formatMoney } from '../../engine/death';

interface Props {
  onClose: () => void;
}

export function LeaderboardScreen({ onClose }: Props) {
  const entries = loadLeaderboard(browserStore());
  return (
    <main className="screen">
      <section className="card">
        <h2>本機排行榜</h2>
        {entries.length === 0 && <p className="muted">還沒有紀錄。</p>}
        {entries.map((e, i) => (
          <div key={e.runId} className="board-row">
            <span className="board-rank">{i + 1}</span>
            <span className="board-days">
              第 {e.days} 天{e.retired ? ' 上岸' : ''}
            </span>
            <span className="muted small">{e.cause}</span>
            <span className="small">峰值 ${formatMoney(e.peakNetWorth)}</span>
          </div>
        ))}
        <p className="muted small">Safari 會清掉七天沒開的網站資料，想保留請用標題畫面的匯出。</p>
      </section>
      <div className="spacer" />
      <button className="btn" onClick={onClose}>
        返回
      </button>
    </main>
  );
}
