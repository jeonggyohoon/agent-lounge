/**
 * 화면이 읽는 형태로 라운지를 한 번에 담아 온다.
 *
 * 파일 하나 바뀔 때마다 통째로 다시 읽는다. 항목 수백 개 규모에서는 이게
 * 캐시 무효화보다 싸고, 무엇보다 화면이 파일과 어긋날 수 없다.
 */
import {
  ENTRY_STATE_META,
  SESSION_STATE_META,
  basenamePath,
  effectiveState,
  supersededIds,
  type Ack,
  type Config,
  type Entry,
  type EntryDoc,
  type EntryState,
  type ReadonlyLounge,
  type Session,
  type Tone,
} from '@lounge/core';

/** 타임라인 한 행이 아는 것. */
export interface EntryView {
  entry: Entry;
  body: string;
  /** 작성 시점과 달라진 ref 경로. `null` 은 "지문을 계산하지 못했다". */
  staleRefs: string[] | null;
  acks: Ack[];
  /** 관계까지 반영한 상태. `entry.state` 와 다를 수 있다. */
  state: EntryState;
  label: string;
  tone: Tone;
}

/** 재실 패널 한 행이 아는 것. */
export interface PresenceView {
  session: Session;
  label: string;
  tone: Tone;
  /** 이 actor 가 쓴 항목 수. 0이면 표시하지 않는다. */
  entryCount: number;
}

export interface Snapshot {
  projectName: string;
  projectRoot: string;
  loungeDir: string;
  config: Config;
  entries: EntryView[];
  presence: PresenceView[];
}

/** 최신이 위. id 가 시각으로 시작하므로 사전 역순이 곧 시간 역순이다. */
function newestFirst(docs: EntryDoc[]): EntryDoc[] {
  return [...docs].sort((a, b) => b.entry.id.localeCompare(a.entry.id));
}

/**
 * 접속 중인 사람이 위. 그다음은 최근에 본 순.
 * 재실이 주인공이므로 지금 있는 사람이 항상 먼저 눈에 들어와야 한다.
 */
function presenceOrder(a: Session, b: Session): number {
  const rank = (s: Session) => (s.state === 'active' ? 0 : 1);
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  return b.last_seen.localeCompare(a.last_seen);
}

export async function readSnapshot(lounge: ReadonlyLounge): Promise<Snapshot> {
  const [config, docs, sessions] = await Promise.all([
    lounge.readConfig(),
    lounge.listEntries(),
    lounge.listSessions(),
  ]);

  // 대체 여부는 저장된 값이 아니라 관계에서 읽는다. mcp 와 같은 함수를 쓴다.
  const superseded = supersededIds(docs.map((d) => d.entry));

  const entries = await Promise.all(
    newestFirst(docs).map(async ({ entry, body }): Promise<EntryView> => {
      const [staleRefs, acks] = await Promise.all([
        // 지문 계산이 막히면 stale 을 "모름"으로 둔다. 틀린 값을 보여주지 않는다.
        lounge.staleRefs(entry).catch(() => null),
        lounge.listAcks(entry.id).catch(() => []),
      ]);
      const state = effectiveState(entry, superseded);
      const meta = ENTRY_STATE_META[state];
      return { entry, body, staleRefs, acks, state, label: meta.label, tone: meta.tone };
    }),
  );

  const counts = new Map<string, number>();
  for (const { entry } of docs) counts.set(entry.by, (counts.get(entry.by) ?? 0) + 1);

  const presence = [...sessions].sort(presenceOrder).map((session): PresenceView => {
    const meta = SESSION_STATE_META[session.state];
    return {
      session,
      label: meta.label,
      tone: meta.tone,
      entryCount: counts.get(session.actor) ?? 0,
    };
  });

  return {
    projectName: config.project || basenamePath(lounge.projectRoot),
    projectRoot: lounge.projectRoot,
    loungeDir: lounge.dir,
    config,
    entries,
    presence,
  };
}
