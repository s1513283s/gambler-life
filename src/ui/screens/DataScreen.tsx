import { useState } from 'react';
import { browserStore, exportRuns, importRuns, loadRuns } from '../../analytics/runlog';

interface Props {
  onClose: () => void;
}

/** 隱藏的匯出 / 匯入畫面，點標題五下進入。分享或複製 JSON，另一台貼上匯入。 */
export function DataScreen({ onClose }: Props) {
  const store = browserStore();
  const [text, setText] = useState('');
  const [message, setMessage] = useState('');
  const runs = loadRuns(store).length;

  const onExport = async () => {
    const json = exportRuns(store);
    setText(json);
    const file = new File([json], 'gambler-life-runs.json', { type: 'application/json' });
    try {
      if (typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'gambler-life runs' });
        setMessage('已分享');
        return;
      }
      await navigator.clipboard.writeText(json);
      setMessage('已複製到剪貼簿');
    } catch {
      setMessage('無法自動分享，請從下方文字框複製');
    }
  };

  const onImport = () => {
    try {
      const added = importRuns(store, text);
      setMessage(`匯入 ${added} 局`);
    } catch (err) {
      setMessage(`匯入失敗：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <main className="screen">
      <section className="card">
        <h2>紀錄匯出 / 匯入</h2>
        <p className="muted small">本機有 {runs} 局紀錄，含每日現金、債務、精神與行動，可拿去分析存活分布。</p>
        <div className="action-grid">
          <button className="btn" onClick={() => void onExport()}>
            匯出
          </button>
          <button className="btn" disabled={text.trim().length === 0} onClick={onImport}>
            匯入文字框內容
          </button>
        </div>
        <textarea className="data-box" value={text} onChange={(e) => setText(e.target.value)} placeholder="匯出的 JSON 會出現在這裡；要匯入就貼上" />
        {message && <p className="ok small">{message}</p>}
      </section>
      <div className="spacer" />
      <button className="btn" onClick={onClose}>
        返回
      </button>
    </main>
  );
}
