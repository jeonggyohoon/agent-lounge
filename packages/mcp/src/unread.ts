/**
 * 계산 규칙.
 *
 * `docs/DATA-CONTRACT.md` 의 「계산 규칙」 절을 그대로 옮긴 것이다.
 * 문서와 이 파일이 어긋나면 문서를 고치거나 여기를 고친다 — 둘 다 방치하면
 * 브리핑이 조용히 틀린다.
 *
 * 이 판단은 **mcp 의 몫이다.** core 는 어떻게 저장하는가까지만 안다.
 */
import {
  effectiveState,
  supersededIds,
  type Ack,
  type Entry,
  type EntryState,
  type ReadonlyLounge,
  type Watermark,
} from '@lounge/core';

/** 항목 한 건에 딸린, 나에게 필요한 사실 전부. */
export interface Seen {
  entry: Entry;
  /**
   * 관계까지 반영한 상태. 남이 뒤집은 항목은 저장된 값이 `open` 이어도
   * 여기서는 `superseded` 다. 유도는 core 가 하고 앱도 같은 함수를 쓴다.
   */
  state: EntryState;
  /** 내 ack. 연 적도 없으면 `null`. */
  mine: Ack | null;
  /** 작성 시점과 달라진 ref 경로. */
  staleRefs: string[];
}

export interface Reading {
  actor: string;
  watermark: Watermark | null;
  seen: Seen[];
}

/** 항목과 내 ack 와 stale 을 한 번에 모은다. */
export async function read(lounge: ReadonlyLounge, actor: string): Promise<Reading> {
  const docs = await lounge.listEntries();
  const superseded = supersededIds(docs.map((d) => d.entry));
  const seen = await Promise.all(
    docs.map(async ({ entry }) => ({
      entry,
      state: effectiveState(entry, superseded),
      mine: await lounge.readAck(entry.id, actor),
      staleRefs: await lounge.staleRefs(entry),
    })),
  );
  return { actor, watermark: await lounge.readWatermark(actor), seen };
}

/**
 * 미확인.
 *
 * ```
 * state == open
 * AND acks/<id>/<actor>.json 에 state 없음
 * AND ( actor ∈ to           # 지목은 워터마크 무시
 *       OR (to 비어있음 AND at >= watermark.since) )
 * ```
 *
 * **열기만 하고 답하지 않은 것도 미확인이다.** ack 파일이 있어도 `state` 가
 * 비어 있으면 아직 처리한 것이 아니다.
 */
export function unread(reading: Reading): Seen[] {
  const since = reading.watermark?.since;
  return reading.seen.filter(({ entry, state, mine }) => {
    if (state !== 'open') return false;
    if (mine?.state) return false;
    if (entry.to.includes(reading.actor)) return true;
    if (entry.to.length > 0) return false;
    // 합류 시점에 생긴 항목은 과거가 아니다. 워터마크는 합류 이전을
    // 잘라내는 역할이므로 경계는 포함이다.
    return since === undefined || entry.at >= since;
  });
}

/**
 * supersede 경고.
 *
 * ```
 * state == superseded
 * AND acks/<id>/<actor>.state == applied
 * ```
 *
 * **워터마크와 ack를 모두 무시하고 강제로 띄운다.** 이미 반영한 쪽이 모르고
 * 지나가면 잘못된 결정이 코드에 남는다. 대체 항목에 ack를 남기면 해소된다.
 */
export function supersedeWarnings(reading: Reading): Seen[] {
  return reading.seen.filter(
    ({ state, mine }) => state === 'superseded' && mine?.state === 'applied',
  );
}

/** 나를 막고 있던 항목이 풀린 것. `blocked` 의 `waiting_on` 이 더는 열려 있지 않다. */
export interface Unblocked {
  /** 내가 blocked 로 답했던 항목. */
  blocked: Entry;
  /** 그때 기다린다고 적은 항목. 사라졌으면 `null`. */
  waitedOn: Entry | null;
}

/**
 * 대기 해제.
 *
 * `blocked` 의 `waiting_on` 은 그 항목이 해결되는 순간 다음 브리핑 맨 위에
 * "진행 가능"으로 떠야 한다. 비워두면 영영 묻히므로 스키마가 강제한다.
 */
export function unblocked(reading: Reading): Unblocked[] {
  const byId = new Map(reading.seen.map((s) => [s.entry.id, s]));
  const out: Unblocked[] = [];

  for (const { entry, mine } of reading.seen) {
    if (mine?.state !== 'blocked' || !mine.waiting_on) continue;
    const target = byId.get(mine.waiting_on) ?? null;
    // 기다리던 항목이 아직 열려 있으면 여전히 막힌 것이다
    if (target && target.state === 'open') continue;
    out.push({ blocked: entry, waitedOn: target?.entry ?? null });
  }
  return out;
}

/** stale — 작성 시점 지문과 달라진 ref 가 하나라도 있는가. 저장하지 않는다. */
export function isStale(seen: Seen): boolean {
  return seen.staleRefs.length > 0;
}
