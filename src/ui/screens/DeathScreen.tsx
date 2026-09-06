import { useEffect, useRef, useState } from 'react';
import { encodeShare } from '../../analytics/share';
import { buildDeathCard } from '../../engine/death';
import { causeLabel } from '../../analytics/runlog';
import { lastNewAchievements, newRunAction, useGame } from '../../store';
import { NetWorthChart } from '../components/NetWorthChart';
import { canShareFile, canvasToPng, renderDeathCard } from '../deathCard';

type ShareState = 'idle' | 'shared' | 'unsupported' | 'failed';

const STAMP: Record<string, string> = { retired: '上岸', fled: '跑路', sober: '收手', ruined: '家破人亡' };

export function DeathScreen() {
  const state = useGame((s) => s.state);
  const dispatch = useGame((s) => s.dispatch);
  const card = buildDeathCard(state);
  const fresh = lastNewAchievements();

  // 一掛載就先把 PNG 畫好，按分享時只做 share，才趕得上 Safari 的使用者手勢視窗
  const fileRef = useRef<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [share, setShare] = useState<ShareState>('idle');
  const [showImage, setShowImage] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    canvasToPng(renderDeathCard(state))
      .then((blob) => {
        if (cancelled) return;
        fileRef.current = new File([blob], `gambler-life-day${state.day}.png`, { type: 'image/png' });
        url = URL.createObjectURL(blob);
        setPreviewUrl(url);
      })
      .catch(() => setShare('failed'));
    return () => {
      cancelled = true;
      if (url !== null) URL.revokeObjectURL(url);
    };
    // state 在 DEATH/RETIRED 不會再變，實際只畫一次
  }, [state]);

  const onShare = async () => {
    const file = fileRef.current;
    if (file === null) return;
    if (!canShareFile(file)) {
      setShare('unsupported');
      setShowImage(true);
      return;
    }
    try {
      await navigator.share({ files: [file], title: card.title });
      setShare('shared');
    } catch {
      setShare('failed');
      setShowImage(true);
    }
  };

  const code = encodeShare({
    days: state.day,
    peak: state.stats.peakNetWorth,
    cause: causeLabel(state),
    background: state.background,
    mode: state.mode,
    dailyKey: state.dailyKey,
    retired: state.phase === 'RETIRED',
  });

  const onCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const good = state.phase === 'RETIRED';
  const stamp = state.ending !== null ? STAMP[state.ending] : '死亡';

  return (
    <main className="screen">
      <section className="card death-card">
        <div className={`stamp ${good ? 'stamp-ok' : ''}`}>{stamp}</div>
        <h2>{card.title}</h2>
        <dl>
          {card.lines.map((line, i) => (
            <div className="death-line stagger" style={{ animationDelay: `${400 + i * 90}ms` }} key={line.label}>
              <dt>{line.label}</dt>
              <dd>{line.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {fresh.length > 0 && (
        <section className="card ach-new">
          <h2>新成就</h2>
          {fresh.map((a) => (
            <div key={a.id} className="kv">
              <span className="gold">{a.name}</span>
              <span className="muted small">{a.blurb}</span>
            </div>
          ))}
        </section>
      )}

      <section className="card">
        <h2>這一局</h2>
        <NetWorthChart history={state.history} biggestLossDay={state.stats.biggestLossDay} />
      </section>

      <section className="card">
        <div className="hero-row">
          <div>
            <div className="shop-name">分享碼</div>
            <div className="muted small">貼給朋友，他貼進排行榜就能比。</div>
          </div>
          <button className="btn btn-small" onClick={() => void onCopyCode()}>
            {copied ? '已複製' : '複製'}
          </button>
        </div>
        <code className="share-code">{code}</code>
      </section>

      {showImage && previewUrl !== null && (
        <section className="card">
          <p className="muted small">這台裝置不支援直接分享，長按圖片儲存。</p>
          <img className="death-preview" src={previewUrl} alt={card.title} />
        </section>
      )}

      <div className="spacer" />
      <button className="btn" disabled={previewUrl === null} onClick={() => void onShare()}>
        {share === 'shared' ? '已分享' : previewUrl === null ? '產生卡片中…' : '分享卡片'}
      </button>
      <button className="btn btn-primary" onClick={() => dispatch(newRunAction(state.mode, state.background))}>
        {state.mode === 'daily' ? '再挑戰一次' : '再來一局'}
      </button>
      <button className="btn" onClick={() => dispatch({ type: 'BACK_TO_TITLE' })}>
        回標題
      </button>
    </main>
  );
}
