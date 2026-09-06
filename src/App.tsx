import { useGame } from './store';
import type { Phase } from './types';
import { Confetti } from './ui/components/Confetti';
import { FloatingDeltas } from './ui/components/FloatingDeltas';
import { StatusBar } from './ui/components/StatusBar';
import { ActionScreen } from './ui/screens/ActionScreen';
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

export default function App() {
  const state = useGame((s) => s.state);
  useSoundEffects(state);
  const burst = useCelebrations();
  const Screen = SCREENS[state.phase];
  const showStatus = state.phase !== 'TITLE';
  const tilt = state.tilt && showStatus;

  return (
    <div className="stage">
      <div className={`app phase-${state.phase.toLowerCase()} ${tilt ? 'app-tilt' : ''}`}>
        <div className="app-vignette" aria-hidden="true" />
        {showStatus && <StatusBar state={state} />}
        <div key={screenKey(state.phase, state.night?.step ?? null)} className="screen-enter">
          <Screen />
        </div>
        <FloatingDeltas />
        <Confetti burst={burst} />
      </div>
    </div>
  );
}
