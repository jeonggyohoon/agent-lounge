/**
 * 도구 6개.
 *
 * MCP 프로토콜과 무관한 순수 async 함수로 둔다. 서버는 이것을 감싸기만 하고,
 * 검수표는 이것을 직접 부른다 — stdio 를 거치지 않아야 무엇이 틀렸는지 보인다.
 */
import { ENTRY_STATE_META, LIMITS, type Ack, type Lounge, type Session } from '@lounge/core';
import { refShaOf } from '@lounge/core/fs';
import { buildBriefing, type Briefing } from './briefing.js';
import { nowIso } from './session.js';
import { sweep, type SweptSession } from './sweep.js';
import { isStale, read, supersedeWarnings, unblocked, unread } from './unread.js';

export interface Context {
  lounge: Lounge;
  actor: string;
  client: string;
  sessionId: string;
  cwd: string;
  /** 시각을 주입받는다. 검수표가 스윕을 재현할 수 있어야 한다. */
  now(): Date;
}

export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolError';
  }
}

/**
 * 아무 도구나 불릴 때 실행하는 게으른 스윕 + 활동 시각 갱신.
 * 데몬이 없으므로 이 자리가 유일한 기회다.
 */
async function touch(context: Context): Promise<SweptSession[]> {
  const swept = await sweep(context.lounge, context.now(), context.sessionId);
  const session = await context.lounge.readSession(context.sessionId);
  if (session && session.state === 'active') {
    await context.lounge.writeSession({ ...session, last_seen: nowIso(context.now()) });
  }
  return swept;
}

// ── join ────────────────────────────────────────────────────────────────

export interface JoinResult extends Briefing {
  sessionId: string;
  swept: SweptSession[];
}

export async function join(context: Context): Promise<JoinResult> {
  const { lounge, actor } = context;
  const at = nowIso(context.now());

  const sessions = await lounge.listSessions();
  // 같은 actor 가 이미 들어와 있으면 경고만 한다. 막지 않는다 —
  // 정말 병렬로 두 개를 돌리는 경우가 있고, 그건 사용자가 판단할 일이다.
  const duplicateSessions = sessions
    .filter((s) => s.actor === actor && s.state === 'active')
    .map((s) => s.id);

  const session: Session = {
    id: context.sessionId,
    actor,
    client: context.client,
    cwd: context.cwd,
    joined_at: at,
    last_seen: at,
    state: 'active',
    left_at: null,
  };
  await lounge.writeSession(session);

  const swept = await touch(context);

  // 최초 입장에만 만들어지고 움직이지 않는다. 입장마다 갱신하면
  // 이전 세션의 미확인이 증발한다.
  await lounge.ensureWatermark(actor, at);

  const reading = await read(lounge, actor);
  const briefing = buildBriefing({
    actor,
    config: await lounge.readConfig(),
    reading,
    unread: unread(reading),
    warnings: supersedeWarnings(reading),
    unblocked: unblocked(reading),
    resume: await lounge.readResume(actor),
    duplicateSessions,
  });

  return { ...briefing, sessionId: context.sessionId, swept };
}

// ── post ────────────────────────────────────────────────────────────────

export interface PostInput {
  area: string;
  title: string;
  about: string;
  body: string;
  to?: string[];
  refs?: string[];
  supersedes?: string | null;
  reply_to?: string | null;
}

export async function post(context: Context, input: PostInput): Promise<{ id: string }> {
  const { lounge, actor } = context;
  await touch(context);

  // 자르지 않고 거부한다. 끝이 잘린 요약은 판단 근거가 못 된다.
  if (!input.about?.trim()) {
    throw new ToolError('about 이 비어 있습니다. 무엇에 대한 결정인지와 누구에게 영향이 가는지를 한 줄로 적습니다.');
  }
  if (input.about.length > LIMITS.aboutMaxLength) {
    throw new ToolError(
      `about 이 ${input.about.length}자입니다. ${LIMITS.aboutMaxLength}자 이내로 다시 씁니다. ` +
        '자르지 않습니다 — 끝이 잘린 요약은 열지 말지를 정하는 근거가 못 됩니다.',
    );
  }

  for (const id of [input.supersedes, input.reply_to]) {
    if (id && !(await lounge.tryReadEntry(id))) {
      throw new ToolError(`${id} 항목이 없습니다.`);
    }
  }

  const at = context.now();
  const id = await lounge.nextEntryId(at, actor);

  // 작성 시점의 지문을 박아 둔다. 나중에 그 파일이 바뀌면 stale 이 붙는다.
  const refs = await Promise.all(
    (input.refs ?? []).map(async (path) => {
      const sha = await refShaOf(lounge.projectRoot, path);
      return sha ? { path, sha } : { path };
    }),
  );

  await lounge.writeEntry(
    {
      id,
      by: actor,
      at: nowIso(at),
      area: input.area,
      title: input.title,
      about: input.about,
      to: input.to ?? [],
      state: 'open',
      refs,
      supersedes: input.supersedes ?? null,
      reply_to: input.reply_to ?? null,
    },
    input.body,
  );

  return { id };
}

// ── open ────────────────────────────────────────────────────────────────

export interface OpenResult {
  id: string;
  title: string;
  about: string;
  by: string;
  at: string;
  area: string;
  state: string;
  staleRefs: string[];
  body: string;
}

/**
 * 본문을 연다.
 *
 * 연 시각만 남기고 `state` 는 비워 둔다. **열기만 한 것은 아직 처리가 아니다** —
 * 그래서 다음 브리핑에도 미확인으로 남는다.
 */
export async function open(context: Context, id: string): Promise<OpenResult> {
  const { lounge, actor } = context;
  await touch(context);

  const doc = await lounge.tryReadEntry(id);
  if (!doc) throw new ToolError(`${id} 항목이 없습니다.`);

  const existing = await lounge.readAck(id, actor);
  await lounge.writeAck({
    ...(existing ?? {}),
    entry: id,
    actor,
    opened_at: existing?.opened_at ?? nowIso(context.now()),
  });

  const reading = await read(lounge, actor);
  const seen = reading.seen.find((s) => s.entry.id === id)!;

  return {
    id,
    title: doc.entry.title,
    about: doc.entry.about,
    by: doc.entry.by,
    at: doc.entry.at,
    area: doc.entry.area,
    state: ENTRY_STATE_META[seen.state].label,
    staleRefs: seen.staleRefs,
    body: doc.body,
  };
}

// ── ack ─────────────────────────────────────────────────────────────────

export interface AckInput {
  entry: string;
  state: 'applied' | 'skipped' | 'blocked';
  note?: string;
  waiting_on?: string | null;
  evidence?: { commit?: string; files?: string[] };
}

export async function ack(context: Context, input: AckInput): Promise<Ack> {
  const { lounge, actor } = context;
  await touch(context);

  if (!(await lounge.tryReadEntry(input.entry))) {
    throw new ToolError(`${input.entry} 항목이 없습니다.`);
  }
  // 비워두면 영영 묻힌다. 스키마도 막지만 여기서 이유를 붙여 돌려준다.
  if (input.state === 'blocked' && !input.waiting_on) {
    throw new ToolError(
      'blocked 에는 waiting_on 이 필요합니다. 무엇이 풀리면 진행되는지 항목 id 로 적습니다. ' +
        '비워두면 풀렸을 때 알려줄 방법이 없습니다.',
    );
  }

  const existing = await lounge.readAck(input.entry, actor);
  return lounge.writeAck({
    entry: input.entry,
    actor,
    state: input.state,
    at: nowIso(context.now()),
    ...(existing?.opened_at ? { opened_at: existing.opened_at } : {}),
    ...(input.note ? { note: input.note } : {}),
    ...(input.evidence ? { evidence: input.evidence } : {}),
    waiting_on: input.waiting_on ?? null,
  });
}

// ── leave ───────────────────────────────────────────────────────────────

export async function leave(context: Context, resume?: string): Promise<{ resumeSaved: boolean }> {
  const { lounge, actor } = context;
  await touch(context);

  if (resume?.trim()) await lounge.writeResume(actor, resume);

  const session = await lounge.readSession(context.sessionId);
  if (session) {
    await lounge.writeSession({ ...session, state: 'left', left_at: nowIso(context.now()) });
  }
  return { resumeSaved: Boolean(resume?.trim()) };
}

// ── digest ──────────────────────────────────────────────────────────────

export interface DigestRow {
  id: string;
  area: string;
  title: string;
  about: string;
  stale: boolean;
}

export interface DigestResult {
  unread: DigestRow[];
  warnings: DigestRow[];
  activeActors: string[];
}

/**
 * 세션 도중 확인.
 *
 * 에이전트 쪽은 실시간이 아니다 — 파일은 즉시 갱신되지만 알아채는 건 다음
 * 도구 호출 때다. 작업 중에 끼어들면 컨텍스트가 오염되므로 의도된 선택이고,
 * 도중에 확인이 필요하면 이걸 부른다.
 */
export async function digest(context: Context): Promise<DigestResult> {
  const { lounge, actor } = context;
  await touch(context);

  const reading = await read(lounge, actor);
  const row = (seen: (typeof reading.seen)[number]): DigestRow => ({
    id: seen.entry.id,
    area: seen.entry.area,
    title: seen.entry.title,
    about: seen.entry.about,
    stale: isStale(seen),
  });

  const sessions = await lounge.listSessions();
  return {
    unread: unread(reading).map(row),
    warnings: supersedeWarnings(reading).map(row),
    activeActors: [
      ...new Set(sessions.filter((s) => s.state === 'active').map((s) => s.actor)),
    ].sort(),
  };
}
