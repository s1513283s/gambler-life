import { ACHIEVEMENTS, loadAchievements } from '../../analytics/achievements';
import { browserStore } from '../../analytics/runlog';

interface Props {
  onClose: () => void;
}

export function AchievementsScreen({ onClose }: Props) {
  const have = new Set(loadAchievements(browserStore()));
  return (
    <main className="screen">
      <section className="card">
        <div className="hero-row">
          <h2>成就</h2>
          <span className="badge badge-gold">
            {have.size} / {ACHIEVEMENTS.length}
          </span>
        </div>
      </section>
      <div className="ach-grid">
        {ACHIEVEMENTS.map((a) => {
          const got = have.has(a.id);
          return (
            <div key={a.id} className={`ach ${got ? 'ach-got' : ''}`}>
              <div className="ach-name">{got ? a.name : '???'}</div>
              <div className="muted small">{a.blurb}</div>
            </div>
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
