import { CONFIG } from './config';
import { useGame } from './store';
import type { Phase } from './types';
import { Confetti } from './ui/components/Confetti';
import { FloatingDeltas } from './ui/components/FloatingDeltas';
import { StatusBar } from './ui/components/StatusBar';
import { useScene } from './ui/sceneStore';
import { ActionScreen } from './ui/screens/ActionScreen';
import { BaccaratTable } from './ui/screens/BaccaratTable';
import { DeathScreen } from './ui/screens/DeathScreen';
import { EveningScreen } from './ui/screens/EveningScreen';
import { NightScreen } from './ui/screens/NightScreen';
import { TitleScreen } from './ui/screens/TitleScreen';
import { VenueScreen } from './ui/screens/VenueScreen';
import { useCelebrations } from './ui/useCelebrations';
import { useSoundEffects } from './ui/useSoundEffects';

const SCREENS: Record<Phase, () => React.JSX.Element | null | undefined> = {
  TITLE: TitleScreen,
  ACTION: ActionScreen,
  VENUE: VenueScreen,
  EVENING: EveningScreen,
  NIGHT: NightScreen,
  DEATH: DeathScreen,
  RETIRED: DeathScreen,
};

/** 畫面切換的 key：phase 換就重播進場動畫；夜晚各步驟也算換畫面 */
function screenKey(phase: Phase, nightStep: string | null): string {
  return nightStep === null ? phase : `${phase}-${nightStep}`;
}

/**
 * 兩種場景：lobby 是大廳框架（HUD + 各畫面），table 是百家樂的獨立全螢幕牌桌。
 * 切換時由 sceneStore 的遮幕先蓋黑再拉開；dispatch 發生在全黑那一刻，所以畫面不會跳。
 */
type Scene = 'lobby' | 'table';

export default function App() {
  const state = useGame((s) => s.state);
  const curtain = useScene((s) => s.curtain);
  const curtainSerial = useScene((s) => s.serial);
  useSoundEffects(state);
  const burst = useCelebrations();

  const Screen = SCREENS[state.phase];
  const showStatus = state.phase !== 'TITLE';
  const tilt = state.tilt && showStatus;
  const inVenue = state.phase === 'VENUE';
  const hot = inVenue && state.venueStreak >= CONFIG.STREAK_HOT;
  const cold = inVenue && state.venueStreak <= -CONFIG.STREAK_COLD;
  const scene: Scene = inVenue && state.venue?.kind === 'baccarat' ? 'table' : 'lobby';

  return (
    <div className="stage">
      <div className={`app phase-${state.phase.toLowerCase()} scene-${scene} ${tilt ? 'app-tilt' : ''} ${hot ? 'streak-hot' : ''} ${cold ? 'streak-cold' : ''}`}>
        <div className="app-vignette" aria-hidden="true" />

        {scene === 'table' && state.venue?.kind === 'baccarat' ? (
          <BaccaratTable key={state.runId} session={state.venue} />
        ) : (
          <>
            {showStatus && <StatusBar state={state} />}
            <div key={screenKey(state.phase, state.night?.step ?? null)} className="screen-enter">
              <Screen />
            </div>
          </>
        )}

        {cold && !state.loanSharkGone && <div className="along-toast">阿龍：「手氣不順？要不要再拿一點？」</div>}
        {hot && <div className="hot-toast">連贏 {state.venueStreak} 把</div>}
        <FloatingDeltas />
        <Confetti burst={burst} />
        {curtain !== 'idle' && <div key={curtainSerial} className={`scene-curtain curtain-${curtain}`} aria-hidden="true" />}
      </div>
    </div>
  );
}
