import { useGame } from '../../store';
import { BlackjackScreen } from './BlackjackScreen';
import { CryptoScreen } from './CryptoScreen';
import { LongmenScreen } from './LongmenScreen';
import { NiuniuScreen } from './NiuniuScreen';
import { ScratchScreen } from './ScratchScreen';
import { SicboScreen } from './SicboScreen';

/** 依 session.kind 分派到各場子畫面。之後每個新場子在這裡加一個 case。 */
export function VenueScreen() {
  const venue = useGame((s) => s.state.venue);
  if (venue === null) return null;
  switch (venue.kind) {
    case 'baccarat':
      return null; // App 直接切到全螢幕的 BaccaratTable，不走大廳框架
    case 'blackjack':
      return <BlackjackScreen session={venue} />;
    case 'scratch':
      return <ScratchScreen session={venue} />;
    case 'crypto':
      return <CryptoScreen session={venue} />;
    case 'sicbo':
      return <SicboScreen session={venue} />;
    case 'niuniu':
      return <NiuniuScreen session={venue} />;
    case 'longmen':
      return <LongmenScreen session={venue} />;
  }
}
