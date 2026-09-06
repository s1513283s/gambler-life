import { useGame } from './store';
import type { Phase } from './types';
import { StatusBar } from './ui/components/StatusBar';
import { ActionScreen } from './ui/screens/ActionScreen';
import { DeathScreen } from './ui/screens/DeathScreen';
import { EveningScreen } from './ui/screens/EveningScreen';
import { MorningScreen } from './ui/screens/MorningScreen';
import { NightScreen } from './ui/screens/NightScreen';
import { TitleScreen } from './ui/screens/TitleScreen';
import { VenueScreen } from './ui/screens/VenueScreen';
import { useSoundEffects } from './ui/useSoundEffects';

const SCREENS: Record<Phase, () => React.JSX.Element | null | undefined> = {
  TITLE: TitleScreen,
  MORNING: MorningScreen,
  ACTION: ActionScreen,
  VENUE: VenueScreen,
  EVENING: EveningScreen,
  NIGHT: NightScreen,
  DEATH: DeathScreen,
  RETIRED: DeathScreen,
};

export default function App() {
  const state = useGame((s) => s.state);
  useSoundEffects(state);
  const Screen = SCREENS[state.phase];
  const showStatus = state.phase !== 'TITLE';

  return (
    <div className="app">
      {showStatus && <StatusBar state={state} />}
      <Screen />
    </div>
  );
}
