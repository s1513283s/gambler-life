import { useEffect, useRef, useState } from 'react';
import { formatMoney } from '../../engine/death';
import { useGame } from '../../store';
import type { GameState } from '../../types';

interface Delta {
  id: number;
  text: string;
  tone: 'ok' | 'danger' | 'warn';
  kind: 'cash' | 'sanity';
}

const LIFETIME_MS = 1100;

function diff(before: GameState, after: GameState, nextId: () => number): Delta[] {
  if (before.runId !== after.runId || after.phase === 'TITLE') return [];
  const out: Delta[] = [];
  const cashDelta = after.cash - before.cash;
  if (cashDelta !== 0) {
    out.push({ id: nextId(), kind: 'cash', tone: cashDelta > 0 ? 'ok' : 'danger', text: `${cashDelta > 0 ? '+' : '-'}$${formatMoney(Math.abs(cashDelta))}` });
  }
  const sanityDelta = after.sanity - before.sanity;
  if (sanityDelta !== 0) {
    out.push({ id: nextId(), kind: 'sanity', tone: sanityDelta > 0 ? 'ok' : 'warn', text: `精神 ${sanityDelta > 0 ? '+' : ''}${sanityDelta}` });
  }
  return out;
}

/** 現金或精神一變動，就從狀態列附近飄出一個「+800」「精神 -5」。直接訂閱 store，不經過 render。 */
export function FloatingDeltas() {
  const idRef = useRef(1);
  const [items, setItems] = useState<Delta[]>([]);

  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const unsubscribe = useGame.subscribe((store, prev) => {
      if (store.state === prev.state) return;
      const fresh = diff(prev.state, store.state, () => idRef.current++);
      if (fresh.length === 0) return;
      setItems((cur) => [...cur, ...fresh]);
      const ids = new Set(fresh.map((f) => f.id));
      const timer = setTimeout(() => {
        timers.delete(timer);
        setItems((cur) => cur.filter((d) => !ids.has(d.id)));
      }, LIFETIME_MS);
      timers.add(timer);
    });
    return () => {
      unsubscribe();
      timers.forEach(clearTimeout);
    };
  }, []);

  if (items.length === 0) return null;
  return (
    <div className="float-layer" aria-hidden="true">
      {items.map((d) => (
        <span key={d.id} className={`float-delta float-${d.kind} ${d.tone}`}>
          {d.text}
        </span>
      ))}
    </div>
  );
}
