import { useEffect, useState } from 'react';
import { loadMeta } from '../../analytics/meta';
import { browserStore } from '../../analytics/runlog';
import { CONFIG } from '../../config';
import { prefetchData } from '../../data/loaders';
import { formatMoney } from '../../engine/death';
import { dailyBackground, newRunAction, todayKey, useGame } from '../../store';
import type { BackgroundId } from '../../types';
import { isSoundEnabled, setSoundEnabled } from '../sound';
import { ACHIEVEMENTS, loadAchievements } from '../../analytics/achievements';
import { AchievementsScreen } from './AchievementsScreen';
import { DataScreen } from './DataScreen';
import { LeaderboardScreen } from './LeaderboardScreen';

export function TitleScreen() {
  const dispatch = useGame((s) => s.dispatch);
  const [panel, setPanel] = useState<'none' | 'board' | 'data' | 'background' | 'ach'>('none');
  const [taps, setTaps] = useState(0);
  const [sound, setSound] = useState(isSoundEnabled());

  // 標題畫面閒置時先把歷史資料抓下來，進場子零等待
  useEffect(() => prefetchData(), []);

  if (panel === 'board') return <LeaderboardScreen onClose={() => setPanel('none')} />;
  if (panel === 'data') return <DataScreen onClose={() => setPanel('none')} />;
  if (panel === 'ach') return <AchievementsScreen onClose={() => setPanel('none')} />;
  if (panel === 'background') return <BackgroundPicker onPick={(bg) => dispatch(newRunAction('free', bg))} onClose={() => setPanel('none')} />;

  const onTitleTap = () => {
    const next = taps + 1;
    if (next >= 5) {
      setTaps(0);
      setPanel('data');
      return;
    }
    setTaps(next);
  };

  const toggleSound = () => {
    setSoundEnabled(!sound);
    setSound(!sound);
  };

  const key = todayKey();
  const dailyBg = CONFIG.BACKGROUNDS.find((b) => b.id === dailyBackground(key));

  return (
    <main className="screen screen-center title-screen">
      <div className="title-bg" aria-hidden="true">
        {Array.from({ length: 7 }, (_, i) => (
          <span
            key={i}
            className="floating-chip"
            style={{ left: `${8 + i * 13}%`, animationDelay: `${i * 1.3}s`, animationDuration: `${9 + (i % 3) * 3}s` }}
          />
        ))}
      </div>
      <h1 className="title title-glow" onClick={onTitleTap}>
        賭徒人生
      </h1>
      <p className="muted">
        每天要付開銷，可以打工也可以賭。
        <br />
        看你能活幾天。
      </p>
      <p className="muted small">開銷每天 +{Math.round(CONFIG.EXPENSE_GROWTH * 100)}%，一局大約十五分鐘。</p>

      <button className="btn btn-primary btn-cta" onClick={() => setPanel('background')}>
        開始
      </button>
      <button className="btn btn-daily" onClick={() => dispatch(newRunAction('daily', 'normal'))}>
        <span className="btn-title">今日挑戰</span>
        <span className="btn-sub">
          {key} · {dailyBg?.name ?? ''} · 全世界同一局
        </span>
      </button>
      <div className="action-grid">
        <button className="btn" onClick={() => setPanel('board')}>
          排行榜
        </button>
        <button className="btn" onClick={() => setPanel('ach')}>
          成就 {loadAchievements(browserStore()).length}/{ACHIEVEMENTS.length}
        </button>
      </div>
      <button className="chip title-chip" onClick={toggleSound}>
        音效 {sound ? '開' : '關'}
      </button>
    </main>
  );
}

function BackgroundPicker({ onPick, onClose }: { onPick: (bg: BackgroundId) => void; onClose: () => void }) {
  const meta = loadMeta(browserStore());
  return (
    <main className="screen">
      <section className="card">
        <h2>你是誰</h2>
        <p className="muted small">每個背景是一種不同的解法。</p>
      </section>
      <div className="bg-grid">
        {CONFIG.BACKGROUNDS.map((b) => {
          const locked = b.id === 'comeback' && !meta.retiredOnce;
          return (
            <button key={b.id} className={`bg-card bg-${b.id} ${locked ? 'bg-locked' : ''}`} disabled={locked} onClick={() => onPick(b.id)}>
              <span className="bg-name">{locked ? '???' : b.name}</span>
              <span className="bg-blurb">{locked ? '上岸過一次才解鎖。' : b.blurb}</span>
              {!locked && (
                <span className="bg-stats">
                  ${formatMoney(b.startCash)}
                  {b.startDebt > 0 ? ` · 欠 $${formatMoney(b.startDebt)}` : ''} · 日薪 ${formatMoney(b.wage)}
                  {b.expenseMultiplier !== 1 ? ` · 開銷 ×${b.expenseMultiplier}` : ''}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="spacer" />
      <button className="btn" onClick={onClose}>
        返回
      </button>
    </main>
  );
}
