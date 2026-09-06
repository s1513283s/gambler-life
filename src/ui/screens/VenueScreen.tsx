import { useGame } from '../../store';
import { BaccaratScreen } from './BaccaratScreen';
import { BlackjackScreen } from './BlackjackScreen';
import { CryptoScreen } from './CryptoScreen';
import { ScratchScreen } from './ScratchScreen';

/** 依 session.kind 分派到各場子畫面。之後每個新場子在這裡加一個 case。 */
export function VenueScreen() {
  const venue = useGame((s) => s.state.venue);
  if (venue === null) return null;
  switch (venue.kind) {
    case 'baccarat':
      return <BaccaratScreen session={venue} />;
    case 'blackjack':
      return <BlackjackScreen session={venue} />;
    case 'scratch':
      return <ScratchScreen session={venue} />;
    case 'crypto':
      return <CryptoScreen session={venue} />;
  }
}
