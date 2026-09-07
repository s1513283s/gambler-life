import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CONFIG } from '../../config';
import { formatMoney } from '../../engine/death';
import type { JobId } from '../../types';
import { motionMs } from '../sceneStore';
import { Icon } from './Icon';

/**
 * 打工 / 休息的情境過場。點主行動時先播 1.5–2 秒的快轉畫面，
 * 播完（或按跳過）那一刻才 onCommit() 真的 dispatch，接著停留一秒看飄字，再 onDone() 關閉。
 * 數值由呼叫端先用純函數算好傳進來，reducer 會算出一模一樣的結果。
 */
type Stage = 'play' | 'settle';

interface WorkProps {
  job: JobId;
  wage: number;
  sanityCost: number;
  onCommit: () => void;
  onDone: () => void;
}

const JOB_TITLE: Record<JobId, string> = { day: '超商日班', delivery: '外送', night: '夜班保全' };
const JOB_CAPTION: Record<JobId, string[]> = {
  day: ['「歡迎光臨」', '嗶。嗶。嗶。', '補貨、收銀、關東煮', '下班了'],
  delivery: ['接單', '紅燈也要衝', '客人不接電話', '最後一單'],
  night: ['巡邏', '螢幕上什麼都沒有', '想睡不能睡', '天亮了'],
};

function useStage(playMs: number, settleMs: number, onCommit: () => void, onDone: () => void) {
  const [stage, setStage] = useState<Stage>('play');
  const [caption, setCaption] = useState(0);

  // 字幕每隔一段換一句
  useEffect(() => {
    if (stage !== 'play') return;
    const every = Math.max(1, motionMs(playMs) / 4);
    const timer = setInterval(() => setCaption((c) => Math.min(c + 1, 3)), every);
    return () => clearInterval(timer);
  }, [stage, playMs]);

  // 播完自動結算
  useEffect(() => {
    if (stage !== 'play') return;
    const timer = setTimeout(() => setStage('settle'), motionMs(playMs));
    return () => clearTimeout(timer);
  }, [stage, playMs]);

  // 結算那一刻 dispatch，停留後關閉。onCommit / onDone 由呼叫端保證穩定，只在進入 settle 時跑一次。
  useEffect(() => {
    if (stage !== 'settle') return;
    onCommit();
    const timer = setTimeout(onDone, motionMs(settleMs));
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  return { stage, caption, skip: () => setStage('settle') };
}

export function WorkModal({ job, wage, sanityCost, onCommit, onDone }: WorkProps) {
  const { stage, caption, skip } = useStage(CONFIG.WORK_ANIM_MS, CONFIG.WORK_SETTLE_MS, onCommit, onDone);
  const settled = stage === 'settle';

  // 掛在 body 上：大廳的 HUD 是 sticky 且有自己的 z-index，畫面內的 fixed 元素蓋不過它
  return createPortal(
    <div className={`immersion immersion-work immersion-${job} ${settled ? 'immersion-settled' : ''}`} role="dialog" aria-label={JOB_TITLE[job]}>
      <div className="immersion-sky" aria-hidden="true" />
      <div className="immersion-body">
        <p className="immersion-title">
          <Icon name="work" size={14} /> {JOB_TITLE[job]}
        </p>

        <div className="immersion-stage">
          {job === 'day' && <ScannerScene />}
          {job === 'delivery' && <ScooterScene />}
          {job === 'night' && <ClockScene />}
          <div className="sweat" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </div>

        {!settled && (
          <p className="immersion-caption" key={caption}>
            {JOB_CAPTION[job][caption]}
          </p>
        )}

        {settled && (
          <div className="immersion-result">
            <span className="immersion-delta ok">+${formatMoney(wage)}</span>
            <span className="immersion-delta warn">−{sanityCost} 精神</span>
            <p className="immersion-note">累了，但今天有錢付房租。</p>
          </div>
        )}
      </div>
      {!settled && (
        <button className="btn btn-small immersion-skip" onClick={skip}>
          跳過
        </button>
      )}
    </div>,
    document.body,
  );
}

interface RestProps {
  sanityGain: number;
  onCommit: () => void;
  onDone: () => void;
}

export function RestModal({ sanityGain, onCommit, onDone }: RestProps) {
  const { stage, skip } = useStage(CONFIG.REST_ANIM_MS, CONFIG.REST_SETTLE_MS, onCommit, onDone);
  const settled = stage === 'settle';

  return createPortal(
    <div className={`immersion immersion-rest ${settled ? 'immersion-settled' : ''}`} role="dialog" aria-label="休息">
      <div className="immersion-sky immersion-sky-night" aria-hidden="true" />
      <div className="immersion-body">
        <p className="immersion-title">
          <Icon name="rest" size={14} /> 休息
        </p>
        <div className="immersion-stage">
          <MoonScene />
        </div>

        <div className="rest-bar" aria-hidden="true">
          <div className="rest-bar-fill" />
          <div className="rest-particles">
            {Array.from({ length: 14 }, (_, i) => (
              <span key={i} style={{ '--i': i } as React.CSSProperties} />
            ))}
          </div>
        </div>

        {!settled ? (
          <p className="immersion-caption breath-text">吸氣……吐氣……</p>
        ) : (
          <div className="immersion-result">
            <span className="immersion-delta ok">+{sanityGain} 精神</span>
            <p className="immersion-note">你呼出一口氣。明天再說。</p>
          </div>
        )}
      </div>
      {!settled && (
        <button className="btn btn-small immersion-skip" onClick={skip}>
          跳過
        </button>
      )}
    </div>,
    document.body,
  );
}

// ---------- 場景圖：全部是 CSS 動畫的 DOM / SVG，不載任何圖檔 ----------

/** 超商掃描槍：商品在輸送帶上滑過，紅色掃描線來回，每次掃到閃一下 */
function ScannerScene() {
  return (
    <div className="scene scanner">
      <div className="scanner-belt">
        {['🥤', '🍙', '🚬', '🍜', '☕', '🍫'].map((item, i) => (
          <span key={i} className="scanner-item" style={{ '--i': i } as React.CSSProperties}>
            {item}
          </span>
        ))}
      </div>
      <div className="scanner-beam" />
      <div className="scanner-gun">
        <span className="scanner-flash" />
      </div>
    </div>
  );
}

/** 外送機車儀表板：時速指針抖動、里程數跳、路面線往後飛 */
function ScooterScene() {
  return (
    <div className="scene scooter">
      <div className="road-lines">
        <span />
        <span />
        <span />
      </div>
      <svg className="dash" viewBox="0 0 200 120" aria-hidden="true">
        <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="10" />
        <path d="M20 100 A80 80 0 0 1 140 34" fill="none" stroke="#39ff9a" strokeWidth="10" />
        <path d="M140 34 A80 80 0 0 1 180 100" fill="none" stroke="#ff3b5c" strokeWidth="10" />
        {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => {
          const a = Math.PI - (i / 8) * Math.PI;
          const x1 = 100 + Math.cos(a) * 66;
          const y1 = 100 - Math.sin(a) * 66;
          const x2 = 100 + Math.cos(a) * 58;
          const y2 = 100 - Math.sin(a) * 58;
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fff" strokeWidth="2" />;
        })}
        <g className="needle">
          <line x1="100" y1="100" x2="100" y2="30" stroke="#ffb02e" strokeWidth="4" strokeLinecap="round" />
          <circle cx="100" cy="100" r="7" fill="#ffb02e" />
        </g>
      </svg>
      <div className="odometer">
        <span className="odo-digit" />
        <span className="odo-unit">km/h</span>
      </div>
    </div>
  );
}

/** 夜班：時鐘瘋狂快轉、監視器雪花 */
function ClockScene() {
  return (
    <div className="scene clockroom">
      <div className="monitors">
        <span />
        <span />
        <span />
        <span />
      </div>
      <svg className="clock" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="46" fill="#0d1019" stroke="#8d93a6" strokeWidth="3" />
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2;
          return (
            <line
              key={i}
              x1={50 + Math.sin(a) * 40}
              y1={50 - Math.cos(a) * 40}
              x2={50 + Math.sin(a) * 35}
              y2={50 - Math.cos(a) * 35}
              stroke="#eef0f6"
              strokeWidth={i % 3 === 0 ? 3 : 1.5}
            />
          );
        })}
        <line className="hand-hour" x1="50" y1="50" x2="50" y2="26" stroke="#eef0f6" strokeWidth="4" strokeLinecap="round" />
        <line className="hand-minute" x1="50" y1="50" x2="50" y2="16" stroke="#f5c542" strokeWidth="3" strokeLinecap="round" />
        <circle cx="50" cy="50" r="3" fill="#f5c542" />
      </svg>
    </div>
  );
}

/** 休息：月亮、呼吸波紋、星星 */
function MoonScene() {
  return (
    <div className="scene moonlight">
      <div className="breath-ring" />
      <div className="breath-ring breath-ring-2" />
      <div className="moon">
        <span className="moon-shadow" />
      </div>
      <div className="stars">
        {Array.from({ length: 12 }, (_, i) => (
          <span key={i} style={{ '--i': i } as React.CSSProperties} />
        ))}
      </div>
    </div>
  );
}
