/**
 * 라운지 읽기와 쓰기.
 *
 * 경로는 전부 `PATHS` 를 거친다. 읽을 때도 쓸 때도 zod 로 검증한다 —
 * 손으로 쓴 파일이나 옛 버전이 남긴 파일이 조용히 흘러 들어오면 앱과 MCP가
 * 서로 다른 것을 보게 된다.
 *
 * 클래스가 둘이다.
 *
 * | | 가진 것 | 쓰는 쪽 |
 * |---|---|---|
 * | `ReadonlyLounge` | 읽기 | 뷰어 |
 * | `Lounge` | 읽기 + 쓰기 | MCP |
 *
 * **뷰어는 `ReadonlyLounge` 만 손에 쥔다.** 쓰기를 참으라고 부탁하는 것이
 * 아니라 부를 함수가 아예 없다.
 *
 * **단일 작성자 원칙**을 전제한다. 한 파일을 두 주체가 쓰는 경우가 없으므로
 * 잠금이나 병합이 없다. 다만 읽는 중에 쓰는 경우는 있으므로 쓰기는
 * 임시 파일 + rename 으로 원자적으로 한다.
 */
import { parseConfig, type Config } from './config.js';
import { findLoungeWith, projectRootOf } from './discover.js';
import { parseFrontmatter, stringifyFrontmatter } from './frontmatter.js';
import type { LoungeIO, LoungeWriteIO } from './io.js';
import { basenamePath, joinPath } from './paths.js';
import { refSha } from './sha.js';
import {
  AckSchema,
  EntrySchema,
  PATHS,
  SessionSchema,
  WatermarkSchema,
  entryId,
  type Ack,
  type Entry,
  type Session,
  type Watermark,
} from './types.js';

/** 머리말과 본문을 합친 항목 한 건. */
export interface EntryDoc {
  entry: Entry;
  body: string;
}

/** 계약에 어긋난 파일을 만났을 때. 어느 파일인지 반드시 들고 다닌다. */
export class LoungeFileError extends Error {
  readonly file: string;

  constructor(file: string, message: string) {
    super(`${file}: ${message}`);
    this.name = 'LoungeFileError';
    this.file = file;
  }
}

function issuesOf(error: { issues: { path: PropertyKey[]; message: string }[] }): string {
  return error.issues.map((i) => `${i.path.join('.')} ${i.message}`.trim()).join('; ');
}

/** 읽기만 하는 라운지. */
export class ReadonlyLounge {
  /** `.lounge/` 의 경로 */
  readonly dir: string;

  /** ref 상대 경로의 기준점 */
  readonly projectRoot: string;

  protected readonly io: LoungeIO;

  constructor(io: LoungeIO, dir: string) {
    this.io = io;
    this.dir = dir;
    this.projectRoot = projectRootOf(dir);
  }

  /** `.lounge/` 안의 상대 경로를 절대 경로로. */
  path(relative: string): string {
    return joinPath(this.dir, relative);
  }

  // ── config ────────────────────────────────────────────────────────────

  async readConfig(): Promise<Config> {
    const file = this.path(PATHS.config);
    const raw = await this.io.readText(file);
    const fallback = basenamePath(this.projectRoot) || 'lounge';
    if (raw === null) return parseConfig({}, fallback);
    try {
      return parseConfig(JSON.parse(raw), fallback);
    } catch (cause) {
      throw new LoungeFileError(file, (cause as Error).message);
    }
  }

  /** 라운지 규약 본문. 없으면 `null`. */
  async readGuide(): Promise<string | null> {
    return this.io.readText(this.path('LOUNGE.md'));
  }

  // ── entries ───────────────────────────────────────────────────────────

  /** id 오름차순. id 가 시각으로 시작하므로 사전순이 곧 시간순이다. */
  async listEntryIds(): Promise<string[]> {
    const names = await this.io.listDir(this.path('entries'));
    return names
      .filter((n) => n.endsWith('.md'))
      .map((n) => n.slice(0, -3))
      .sort();
  }

  async readEntry(id: string): Promise<EntryDoc> {
    const file = this.path(PATHS.entry(id));
    const raw = await this.io.readText(file);
    if (raw === null) throw new LoungeFileError(file, '항목이 없습니다');
    return parseEntryDoc(file, raw);
  }

  async tryReadEntry(id: string): Promise<EntryDoc | null> {
    const file = this.path(PATHS.entry(id));
    const raw = await this.io.readText(file);
    return raw === null ? null : parseEntryDoc(file, raw);
  }

  async listEntries(): Promise<EntryDoc[]> {
    const ids = await this.listEntryIds();
    return Promise.all(ids.map((id) => this.readEntry(id)));
  }

  // ── acks ──────────────────────────────────────────────────────────────

  async listAckActors(entry: string): Promise<string[]> {
    const names = await this.io.listDir(this.path(PATHS.ackDir(entry)));
    return names
      .filter((n) => n.endsWith('.json'))
      .map((n) => n.slice(0, -5))
      .sort();
  }

  async readAck(entry: string, actor: string): Promise<Ack | null> {
    const file = this.path(PATHS.ack(entry, actor));
    const json = await this.readJson(file);
    if (json === null) return null;
    const result = AckSchema.safeParse(json);
    if (!result.success) throw new LoungeFileError(file, issuesOf(result.error));
    return result.data;
  }

  async listAcks(entry: string): Promise<Ack[]> {
    const actors = await this.listAckActors(entry);
    const acks = await Promise.all(actors.map((a) => this.readAck(entry, a)));
    return acks.filter((a): a is Ack => a !== null);
  }

  // ── sessions ──────────────────────────────────────────────────────────

  async listSessions(): Promise<Session[]> {
    const names = await this.io.listDir(this.path('sessions'));
    const ids = names.filter((n) => n.endsWith('.json')).map((n) => n.slice(0, -5));
    const sessions = await Promise.all(ids.map((id) => this.readSession(id)));
    return sessions
      .filter((s): s is Session => s !== null)
      .sort((a, b) => a.joined_at.localeCompare(b.joined_at));
  }

  async readSession(id: string): Promise<Session | null> {
    const file = this.path(PATHS.session(id));
    const json = await this.readJson(file);
    if (json === null) return null;
    const result = SessionSchema.safeParse(json);
    if (!result.success) throw new LoungeFileError(file, issuesOf(result.error));
    return result.data;
  }

  // ── watermark, resume ─────────────────────────────────────────────────

  async readWatermark(actor: string): Promise<Watermark | null> {
    const file = this.path(PATHS.watermark(actor));
    const json = await this.readJson(file);
    if (json === null) return null;
    const result = WatermarkSchema.safeParse(json);
    if (!result.success) throw new LoungeFileError(file, issuesOf(result.error));
    return result.data;
  }

  async readResume(actor: string): Promise<string | null> {
    return this.io.readText(this.path(PATHS.resume(actor)));
  }

  // ── stale ─────────────────────────────────────────────────────────────

  /**
   * 작성 시점 지문과 달라진 ref 경로들. **저장하지 않는다.**
   * 라운지가 아니라 코드가 진실이므로 읽을 때마다 새로 계산한다.
   */
  async staleRefs(entry: Entry): Promise<string[]> {
    const checked = await Promise.all(
      entry.refs.map(async (ref) => {
        if (!ref.sha) return null;
        const current = await refSha(this.io, this.projectRoot, ref.path);
        return current === ref.sha ? null : ref.path;
      }),
    );
    return checked.filter((p): p is string => p !== null);
  }

  async isStale(entry: Entry): Promise<boolean> {
    return (await this.staleRefs(entry)).length > 0;
  }

  protected async readJson(file: string): Promise<unknown | null> {
    const raw = await this.io.readText(file);
    if (raw === null) return null;
    try {
      return JSON.parse(raw);
    } catch (cause) {
      throw new LoungeFileError(file, (cause as Error).message);
    }
  }
}

/** 읽고 쓰는 라운지. MCP 만 이걸 쥔다. */
export class Lounge extends ReadonlyLounge {
  protected override readonly io: LoungeWriteIO;

  constructor(io: LoungeWriteIO, dir: string) {
    super(io, dir);
    this.io = io;
  }

  /** 머리말을 검증해 기록한다. `id` `by` `at` 은 호출자가 이미 채워 온 값이다. */
  async writeEntry(entry: unknown, body: string): Promise<EntryDoc> {
    const parsed = EntrySchema.parse(entry);
    await this.writeAtomic(this.path(PATHS.entry(parsed.id)), stringifyFrontmatter(parsed, body));
    return { entry: parsed, body: body.trim() };
  }

  /**
   * 같은 분에 같은 actor 가 두 번 쓰면 `-2`, `-3` 을 붙인다.
   * 중앙 카운터가 없으므로 번호를 집는 경합이 구조적으로 생기지 않는다.
   */
  async nextEntryId(at: Date, actor: string): Promise<string> {
    const taken = new Set(await this.listEntryIds());
    for (let seq = 1; ; seq += 1) {
      const id = entryId(at, actor, seq);
      if (!taken.has(id)) return id;
    }
  }

  async writeAck(ack: unknown): Promise<Ack> {
    const parsed = AckSchema.parse(ack);
    await this.writeAtomic(
      this.path(PATHS.ack(parsed.entry, parsed.actor)),
      `${JSON.stringify(parsed, null, 2)}\n`,
    );
    return parsed;
  }

  async writeSession(session: unknown): Promise<Session> {
    const parsed = SessionSchema.parse(session);
    await this.writeAtomic(
      this.path(PATHS.session(parsed.id)),
      `${JSON.stringify(parsed, null, 2)}\n`,
    );
    return parsed;
  }

  /**
   * 없을 때만 만든다. 이미 있으면 그대로 돌려준다.
   * 입장마다 갱신하면 이전 세션의 미확인이 증발한다 — 갱신 경로를 아예 두지 않는다.
   */
  async ensureWatermark(actor: string, since: string): Promise<Watermark> {
    const existing = await this.readWatermark(actor);
    if (existing) return existing;
    const parsed = WatermarkSchema.parse({ actor, since });
    await this.writeAtomic(
      this.path(PATHS.watermark(actor)),
      `${JSON.stringify(parsed, null, 2)}\n`,
    );
    return parsed;
  }

  /** 매번 덮어쓴다. 미래의 자신에게 쓰는 메모라 이력이 필요 없다. */
  async writeResume(actor: string, text: string): Promise<void> {
    await this.writeAtomic(this.path(PATHS.resume(actor)), `${text.trim()}\n`);
  }

  /** 임시 파일에 쓰고 rename. 반쯤 쓰인 파일을 뷰어가 읽는 일이 없다. */
  private async writeAtomic(path: string, data: string): Promise<void> {
    const tmp = `${path}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
    await this.io.writeText(tmp, data);
    try {
      await this.io.rename(tmp, path);
    } catch (error) {
      await this.io.remove(tmp);
      throw error;
    }
  }
}

function parseEntryDoc(file: string, raw: string): EntryDoc {
  let doc;
  try {
    doc = parseFrontmatter(raw);
  } catch (cause) {
    throw new LoungeFileError(file, (cause as Error).message);
  }
  const result = EntrySchema.safeParse(doc.data);
  if (!result.success) throw new LoungeFileError(file, issuesOf(result.error));
  return { entry: result.data, body: doc.body };
}

/** 이미 아는 경로로 읽기 전용으로 연다. */
export function openReadonlyLounge(io: LoungeIO, dir: string): ReadonlyLounge {
  return new ReadonlyLounge(io, dir);
}

/** 위로 올라가며 찾아 읽기 전용으로 연다. 못 찾으면 `LoungeNotFoundError`. */
export async function discoverReadonlyLounge(
  io: LoungeIO,
  startDir: string,
): Promise<ReadonlyLounge> {
  return new ReadonlyLounge(io, await findLoungeWith(io, startDir));
}
