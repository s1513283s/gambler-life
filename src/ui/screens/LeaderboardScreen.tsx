import { useState } from 'react';
import { addSharedEntry, browserStore, loadLeaderboard } from '../../analytics/runlog';
import { decodeShare, shareToEntry } from '../../analytics/share';
import { CONFIG } from '../../config';
import { formatMoney } from '../../engine/death';
import { todayKey } from '../../store';

interface Props {
  onClose: () => void;
}

type Tab = 'all' | 'peak' | 'daily';

export function LeaderboardScreen({ onClose }: Props) {
  const [tab, setTab] = useState<Tab>('all');
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const [version, setVersion] = useState(0);
  const onImport = () => {
    try {
      const entry = shareToEntry(decodeShare(code), code);
      const added = addSharedEntry(browserStore(), entry);
      setMsg(added ? `加進來了：第 ${entry.days} 天` : '這個分享碼已經在榜上');
      setCode('');
      setVersion(version + 1);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    }
  };
  const key = todayKey();
  const all = loadLeaderboard(browserStore());
  const entries =
    tab === 'all' ? all : tab === 'peak' ? [...all].sort((a, b) => b.peakNetWorth - a.peakNetWorth) : all.filter((e) => e.mode === 'daily' && e.dailyKey === key);
  const bgName = (id: string) => CONFIG.BACKGROUNDS.find((b) => b.id === id)?.name ?? '';

  return (
    <main className="screen">
      <section className="card">
        <div className="hero-row">
          <h2>本機排行榜</h2>
          <div className="mode-toggle">
            <button className={`chip ${tab === 'all' ? 'chip-active' : ''}`} onClick={() => setTab('all')}>
              天數
            </button>
            <button className={`chip ${tab === 'peak' ? 'chip-active' : ''}`} onClick={() => setTab('peak')}>
              峰值
            </button>
            <button className={`chip ${tab === 'daily' ? 'chip-active' : ''}`} onClick={() => setTab('daily')}>
              今日挑戰
            </button>
          </div>
        </div>
        {entries.length === 0 && <p className="muted">{tab === 'daily' ? `${key} 還沒有人挑戰。` : '還沒有紀錄。'}</p>}
        {entries.map((e, i) => (
          <div key={e.runId} className="board-row">
            <span className="board-rank">{i + 1}</span>
            <span className="board-days">
              第 {e.days} 天{e.retired ? ' 上岸' : ''}
              {e.mode === 'daily' ? ` · ${e.dailyKey}` : ''}
            </span>
            <span className="muted small">
              {e.shared ? '朋友 · ' : ''}
              {bgName(e.background)} · {e.cause}
            </span>
            <span className="small">峰值 ${formatMoney(e.peakNetWorth)}</span>
          </div>
        ))}
        <p className="muted small">Safari 會清掉七天沒開的網站資料，想保留請用標題畫面的匯出。</p>
      </section>

      <section className="card">
        <h2>貼上朋友的分享碼</h2>
        <input className="share-input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="GL1.…" />
        <button className="btn" disabled={code.trim().length === 0} onClick={onImport}>
          加進排行榜
        </button>
        {msg && <p className="small ok">{msg}</p>}
      </section>
      <div className="spacer" />
      <button className="btn" onClick={onClose}>
        返回
      </button>
    </main>
  );
}
