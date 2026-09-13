/**
 * 항목 사이의 관계.
 *
 * `supersedes` 는 **새 항목이 자기 머리말에 적는다.** 대체당한 쪽 파일은
 * 건드리지 않는다 — 남의 항목을 고치면 한 파일을 두 주체가 쓰게 되고,
 * 그 순간 잠금이 필요해지면서 설계 전체가 무너진다.
 *
 * 그래서 "이 항목이 대체됐는가"는 저장된 값이 아니라 **관계에서 읽는다.**
 * 판단이 아니라 사실이므로 core 에 둔다. 앱과 MCP가 각자 유도하면
 * 한쪽만 경고를 띄우는 날이 온다.
 */
import type { Entry, EntryState } from './types.js';

/** 다른 항목이 `supersedes` 로 가리키고 있는 항목 id 들. */
export function supersededIds(entries: readonly Entry[]): Set<string> {
  const out = new Set<string>();
  for (const entry of entries) {
    if (entry.supersedes) out.add(entry.supersedes);
  }
  return out;
}

/**
 * 화면과 계산이 함께 쓰는 상태.
 *
 * 작성자가 스스로 `superseded` 로 적어둔 경우와, 남이 뒤집어서 관계로만
 * 드러나는 경우를 하나로 본다.
 */
export function effectiveState(entry: Entry, superseded: ReadonlySet<string>): EntryState {
  if (entry.state === 'superseded') return 'superseded';
  // 이미 종결되거나 폐기된 항목까지 되돌리지는 않는다
  if (entry.state === 'open' && superseded.has(entry.id)) return 'superseded';
  return entry.state;
}
