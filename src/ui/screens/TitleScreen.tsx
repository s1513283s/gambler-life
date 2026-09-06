import { useEffect, useState } from 'react';
import { CONFIG } from '../../config';
import { prefetchData } from '../../data/loaders';
import { formatMoney } from '../../engine/death';
import { newRunAction, useGame } from '../../store';
import { isSoundEnabled, setSoundEnabled } from '../sound';
import { DataScreen } from './DataScreen';
import { LeaderboardScreen } from './LeaderboardScreen';

export function TitleScreen() {
  const dispatch = useGame((s) => s.dispatch);
  const [panel, setPanel] = useState<'none' | 'board' | 'data'>('none');
  const [taps, setTaps] = useState(0);
  const [sound, setSound] = useState(isSoundEnabled());

  // 標題畫面閒置時先把歷史資料抓下來，進場子零等待
  useEffect(() => prefetchData(), []);

  if (panel === 'board') return <LeaderboardScreen onClose={() => setPanel('none')} />;
  if (panel === 'data') return <DataScreen onClose={() => setPanel('none')} />;

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

  return (
    <main className="screen screen-center">
      <h1 className="title" onClick={onTitleTap}>
        賭徒人生
      </h1>
      <p className="muted">
        每天要付開銷，可以打工也可以賭。
        <br />
        看你能活幾天。
      </p>
      <p className="muted small">
        起手 ${formatMoney(CONFIG.START_CASH)}，日薪 ${formatMoney(CONFIG.WAGE)}，開銷每天 +{CONFIG.EXPENSE_GROWTH * 100}%
      </p>
      <button className="btn btn-primary" onClick={() => dispatch(newRunAction())}>
        開始
      </button>
      <button className="btn" onClick={() => setPanel('board')}>
        排行榜
      </button>
      <button className="chip title-chip" onClick={toggleSound}>
        音效 {sound ? '開' : '關'}
      </button>
    </main>
  );
}
