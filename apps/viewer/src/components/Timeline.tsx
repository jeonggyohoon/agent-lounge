import { useEffect, useRef, useState } from 'react';
import type { EntryView } from '../lib/snapshot.js';
import { clockOf, dayOf } from '../lib/time.js';

/**
 * 항목 타임라인. 최신이 위.
 *
 * **단은 하나다.** 좌우로 나누면 시선이 갈라져 흘깃 보기 어려워진다.
 * 처리된 항목은 숨기지 않고 흐려진다.
 */
export function Timeline({
  entries,
  selectedId,
  onSelect,
}: {
  entries: EntryView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const arrived = useArrivedEntries(entries);

  if (entries.length === 0) {
    return <p className="timeline__empty">아직 오간 내용이 없습니다</p>;
  }

  return (
    <section className="timeline" aria-label="항목">
      {entries.map((view) => (
        <EntryRow
          key={view.entry.id}
          view={view}
          selected={view.entry.id === selectedId}
          arrived={arrived.has(view.entry.id)}
          onSelect={onSelect}
        />
      ))}
    </section>
  );
}

function EntryRow({
  view,
  selected,
  arrived,
  onSelect,
}: {
  view: EntryView;
  selected: boolean;
  arrived: boolean;
  onSelect: (id: string) => void;
}) {
  const { entry, label, tone, staleRefs } = view;
  // open 이 아닌 항목은 읽지 않아도 되는 것이므로 물러난다
  const settled = entry.state !== 'open';
  const day = dayOf(entry.at);

  return (
    <button
      type="button"
      className={[
        'entry',
        settled && 'entry--settled',
        selected && 'entry--selected',
        arrived && 'entry--arrived',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={() => onSelect(entry.id)}
      aria-pressed={selected}
    >
      <span className="entry__meta">
        <span className="entry__clock">{clockOf(entry.at)}</span>
        {day && <span className="entry__day">{day}</span>}
        <span className="entry__by">{entry.by}</span>
        <span className="entry__area">{entry.area}</span>
        <span className={`entry__state entry__state--${tone}`}>{label}</span>
      </span>
      <span className="entry__title">{entry.title}</span>
      <span className="entry__about">{entry.about}</span>
      {staleRefs !== null && staleRefs.length > 0 && (
        <span className="entry__stale">참조 파일이 바뀌었습니다</span>
      )}
    </button>
  );
}

/** 새로 도착한 항목만 한 번 등장시킨다. 이미 있던 항목은 가만히 둔다. */
function useArrivedEntries(entries: EntryView[]): Set<string> {
  const seen = useRef<Set<string> | null>(null);
  const [arrived, setArrived] = useState<Set<string>>(new Set());

  useEffect(() => {
    const ids = new Set(entries.map((e) => e.entry.id));
    if (seen.current === null) {
      // 첫 그리기는 도착이 아니다. 전부 한꺼번에 튀어나오면 소음이다.
      seen.current = ids;
      return;
    }
    const fresh = new Set([...ids].filter((id) => !seen.current!.has(id)));
    seen.current = ids;
    if (fresh.size === 0) return;

    setArrived(fresh);
    const timer = setTimeout(() => setArrived(new Set()), 400);
    return () => clearTimeout(timer);
  }, [entries]);

  return arrived;
}
