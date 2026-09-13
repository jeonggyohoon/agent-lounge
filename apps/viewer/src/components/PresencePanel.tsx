import { useEffect, useRef, useState } from 'react';
import type { PresenceView } from '../lib/snapshot.js';
import { agoOf } from '../lib/time.js';
import { Dot } from './Dot.js';

/**
 * 재실 패널.
 *
 * **항상 펼쳐져 있다.** 접히면 존재 이유가 사라진다.
 * 아무도 없으면 자리를 비우지 말고 그렇게 쓴다.
 */
export function PresencePanel({ presence, tick }: { presence: PresenceView[]; tick: number }) {
  const changed = useChangedActors(presence);

  return (
    <section className="presence" aria-label="접속자">
      {presence.length === 0 ? (
        <p className="presence__empty">아무도 없습니다</p>
      ) : (
        presence.map((row) => (
          <PresenceRow
            key={row.session.id}
            row={row}
            tick={tick}
            blink={changed.has(row.session.id)}
          />
        ))
      )}
    </section>
  );
}

function PresenceRow({
  row,
  tick,
  blink,
}: {
  row: PresenceView;
  tick: number;
  blink: boolean;
}) {
  // tick 은 상대 시각을 다시 계산하게 하는 신호다
  void tick;
  const { session, label, tone, entryCount } = row;

  return (
    <div className="presence__row">
      <Dot tone={tone} blink={blink} />
      <span className="presence__actor">{session.actor}</span>
      <span className="presence__seen">{agoOf(session.last_seen)}</span>
      <span className="presence__note">
        {session.state === 'active'
          ? entryCount > 0 && `항목 ${entryCount}건`
          : label}
      </span>
    </div>
  );
}

/**
 * 상태가 바뀐 세션을 한 번만 깜박이게 한다.
 * 움직임은 변화가 있을 때만 — 새 항목 도착과 재실 변화, 그 둘뿐이다.
 */
function useChangedActors(presence: PresenceView[]): Set<string> {
  const previous = useRef(new Map<string, string>());
  const [changed, setChanged] = useState<Set<string>>(new Set());

  useEffect(() => {
    const next = new Map(presence.map((p) => [p.session.id, p.session.state]));
    const moved = new Set<string>();
    for (const [id, state] of next) {
      const before = previous.current.get(id);
      if (before !== undefined && before !== state) moved.add(id);
    }
    previous.current = next;
    if (moved.size === 0) return;

    setChanged(moved);
    const timer = setTimeout(() => setChanged(new Set()), 600);
    return () => clearTimeout(timer);
  }, [presence]);

  return changed;
}
