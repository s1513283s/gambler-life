import { useEffect, useRef, useState } from 'react';
import { buildDeathCard } from '../../engine/death';
import { newRunAction, useGame } from '../../store';
import { canShareFile, canvasToPng, renderDeathCard } from '../deathCard';

type ShareState = 'idle' | 'shared' | 'unsupported' | 'failed';

export function DeathScreen() {
  const state = useGame((s) => s.state);
  const dispatch = useGame((s) => s.dispatch);
  const card = buildDeathCard(state);

  // 一掛載就先把 PNG 畫好，按分享時只做 share，才趕得上 Safari 的使用者手勢視窗
  const fileRef = useRef<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [share, setShare] = useState<ShareState>('idle');
  const [showImage, setShowImage] = useState(false);

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

  return (
    <main className="screen">
      <section className="card death-card">
        <h2>{card.title}</h2>
        <dl>
          {card.lines.map((line) => (
            <div className="death-line" key={line.label}>
              <dt>{line.label}</dt>
              <dd>{line.value}</dd>
            </div>
          ))}
        </dl>
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
      <button className="btn btn-primary" onClick={() => dispatch(newRunAction())}>
        再來一局
      </button>
      <button className="btn" onClick={() => dispatch({ type: 'BACK_TO_TITLE' })}>
        回標題
      </button>
    </main>
  );
}
