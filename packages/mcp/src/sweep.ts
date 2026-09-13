/**
 * 게으른 스윕.
 *
 * 데몬이 없으므로 아무 도구나 호출될 때 실행한다. `idleMinutes` 를 넘도록
 * 소식이 없는 active 세션을 `abandoned` 로 바꾸고, 그 세션이 resume 을
 * 남기지 않았으면 `by: system` 항목을 만든다.
 *
 * **`abandoned` 를 `left` 와 반드시 구분한다.** 정상 반납은 "끝났다"지만
 * 비정상 종료는 "반쯤 고쳐놨을 수 있다"라서 다음 사람의 행동이 달라져야 한다.
 */
import type { Lounge, Session } from '@lounge/core';
import { nowIso } from './session.js';

const SYSTEM_ACTOR = 'system';

export interface SweptSession {
  session: Session;
  /** 이 세션 때문에 만들어진 시스템 항목의 id. resume 이 있었으면 `null`. */
  entryId: string | null;
}

/**
 * `exceptSessionId` 는 방금 내가 만든 세션이다. 자기 자신을 쓸어버리지 않는다.
 */
export async function sweep(
  lounge: Lounge,
  now: Date = new Date(),
  exceptSessionId?: string,
): Promise<SweptSession[]> {
  const config = await lounge.readConfig();
  const idleMs = config.sweep.idleMinutes * 60_000;
  const sessions = await lounge.listSessions();
  const swept: SweptSession[] = [];

  for (const session of sessions) {
    if (session.state !== 'active') continue;
    if (session.id === exceptSessionId) continue;

    const lastSeen = new Date(session.last_seen).getTime();
    if (Number.isNaN(lastSeen) || now.getTime() - lastSeen <= idleMs) continue;

    const abandoned: Session = { ...session, state: 'abandoned' };
    await lounge.writeSession(abandoned);

    // resume 이 있으면 다음 사람이 읽을 것이 이미 있다. 항목까지 만들지 않는다.
    const resume = await lounge.readResume(session.actor);
    const entryId = resume ? null : await announce(lounge, abandoned, now);
    swept.push({ session: abandoned, entryId });
  }
  return swept;
}

async function announce(lounge: Lounge, session: Session, now: Date): Promise<string> {
  const id = await lounge.nextEntryId(now, SYSTEM_ACTOR);
  const at = nowIso(now);
  const body = [
    `\`${session.actor}\` 의 세션이 정상적으로 반납되지 않았습니다.`,
    '',
    `- 세션 ${session.id}`,
    `- 마지막 활동 ${session.last_seen}`,
    '',
    '남긴 메모가 없습니다. 작업이 중간에 끊겼을 수 있으니 이 actor 가 건드리던',
    '범위를 이어받기 전에 코드 상태를 먼저 확인하세요.',
  ].join('\n');

  await lounge.writeEntry(
    {
      id,
      by: SYSTEM_ACTOR,
      at,
      area: 'lounge/session',
      title: `${session.actor} 세션이 비정상 종료됨`,
      about: `${session.actor} 가 메모 없이 끊겼습니다. 그 범위를 이어받기 전에 코드 상태를 확인하세요`,
      to: [],
      state: 'open',
      refs: [],
      supersedes: null,
      reply_to: null,
    },
    body,
  );
  return id;
}
