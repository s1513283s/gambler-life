import type { Card } from '../../types';
import { cardLabel, isRed } from '../../venues/cards';

interface Props {
  cards: Card[];
  /** 動畫中：每張依序淡入 */
  revealing: boolean;
  /** 與其他列錯開的起始延遲（毫秒） */
  delayMs?: number;
  /** 隱藏第幾張（21 點底牌），-1 表示不隱藏 */
  hiddenIndex?: number;
}

export function PlayingCards({ cards, revealing, delayMs = 0, hiddenIndex = -1 }: Props) {
  return (
    <div className="hand-cards">
      {cards.map((c, i) =>
        i === hiddenIndex ? (
          <span key={`back-${i}`} className="playing-card card-back" />
        ) : (
          <span
            key={`${c}-${i}`}
            className={`playing-card ${isRed(c) ? 'card-red' : ''} ${revealing ? 'card-deal' : ''}`}
            style={revealing ? { animationDelay: `${delayMs + i * 300}ms` } : undefined}
          >
            {cardLabel(c)}
          </span>
        ),
      )}
    </div>
  );
}
