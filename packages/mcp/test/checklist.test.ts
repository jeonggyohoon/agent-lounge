/**
 * `docs/ROADMAP.md` 의 검수표 T1~T16.
 *
 * 이름을 번호 그대로 쓴다. 검수표와 테스트 목록이 한눈에 대응하지 않으면
 * "다 통과했다"는 말을 믿을 근거가 없다.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { openLounge, refShaOf } from '@lounge/core/fs';
import type { Lounge } from '@lounge/core';
import { getEncoding } from 'js-tiktoken';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { estimateTokens, TOKEN_BUDGET } from '../src/briefing.js';
import { nowIso, sessionId } from '../src/session.js';
import { ack, join, open, post, ToolError, type Context } from '../src/tools.js';

const encoder = getEncoding('cl100k_base');

let root: string;
let lounge: Lounge;
let clock: Date;

/** 시각을 손에 쥔다. 스윕과 워터마크는 시간이 흘러야 재현된다. */
function ctx(actor: string): Context {
  return {
    lounge,
    actor,
    client: actor.split('@')[0]!,
    sessionId: sessionId(actor, clock.getTime()),
    cwd: root,
    now: () => clock,
  };
}

function tick(minutes: number): void {
  clock = new Date(clock.getTime() + minutes * 60_000);
}

const BODY = '본문입니다.';

async function write(actor: string, fields: Partial<Parameters<typeof post>[1]> = {}) {
  return post(ctx(actor), {
    area: 'api/auth',
    title: '스펙 확정',
    about: '요청과 응답 형태를 확정했고 인증 붙이는 쪽이 영향받는다',
    body: BODY,
    ...fields,
  });
}

beforeEach(async () => {
  root = await mkdtemp(resolve(tmpdir(), 'lounge-t-'));
  await mkdir(resolve(root, '.lounge'), { recursive: true });
  await writeFile(resolve(root, '.lounge/config.json'), '{"project":"검수"}');
  lounge = openLounge(resolve(root, '.lounge'));
  clock = new Date(2026, 8, 13, 10, 0, 0);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('검수표', () => {
  it('T1 — about 없이 post 하면 거부한다', async () => {
    await expect(write('codex', { about: '' })).rejects.toBeInstanceOf(ToolError);
    await expect(write('codex', { about: '   ' })).rejects.toBeInstanceOf(ToolError);
    expect(await lounge.listEntryIds()).toEqual([]);
  });

  it('T2 — about 130자면 거부한다. 자르지 않는다', async () => {
    const long = 'ㄱ'.repeat(130);
    await expect(write('codex', { about: long })).rejects.toThrow(/130자/);
    // 잘라서 저장하지 않았는지 본다 — 거부는 저장 안 함이어야 한다
    expect(await lounge.listEntryIds()).toEqual([]);
  });

  it('T3 — blocked 인데 waiting_on 이 없으면 거부한다', async () => {
    const { id } = await write('codex');
    const mine = ctx('claude-code@auth');
    await expect(ack(mine, { entry: id, state: 'blocked' })).rejects.toThrow(/waiting_on/);
    await expect(
      ack(mine, { entry: id, state: 'blocked', waiting_on: id }),
    ).resolves.toBeTruthy();
  });

  it('T4 — 항목 8개 상태로 join 하면 5건만 펼치고 나머지는 건수만 낸다', async () => {
    const me = ctx('claude-code@auth');
    await join(me);
    tick(1);

    const ids: string[] = [];
    for (let n = 1; n <= 8; n += 1) {
      tick(1);
      ids.push((await write('codex', { title: `결정 ${n}`, about: `${n}번째 결정입니다` })).id);
    }

    tick(1);
    const briefing = await join(ctx('claude-code@auth'));
    expect(briefing.text).toContain('미확인 8건');
    const expanded = ids.filter((id) => briefing.text.includes(id));
    expect(expanded).toHaveLength(5);
    expect(briefing.text).toContain('외 3건');
  });

  it('T5 — ack 한 항목은 재입장 시 미확인에서 사라진다', async () => {
    const me = ctx('claude-code@auth');
    await join(me);
    tick(1);
    const { id } = await write('codex');

    tick(1);
    expect((await join(ctx('claude-code@auth'))).text).toContain(id);

    await ack(ctx('claude-code@auth'), { entry: id, state: 'applied', note: '반영함' });
    tick(1);
    const after = await join(ctx('claude-code@auth'));
    expect(after.text).not.toContain(id);
    expect(after.text).toContain('미확인 없음');
  });

  it('T6 — skipped 한 항목은 다시 뜨지 않는다', async () => {
    await join(ctx('claude-code@auth'));
    tick(1);
    const { id } = await write('codex');
    tick(1);
    await ack(ctx('claude-code@auth'), { entry: id, state: 'skipped' });

    tick(1);
    expect((await join(ctx('claude-code@auth'))).text).not.toContain(id);
  });

  it('T7 — 클라이언트를 재시작해도 이전 미확인이 남는다', async () => {
    await join(ctx('claude-code@auth'));
    tick(1);
    const { id } = await write('codex');

    // 세션 id 가 매번 다른 것이 재시작이다. 워터마크는 actor 에 붙어 움직이지 않는다.
    tick(5);
    const first = await join(ctx('claude-code@auth'));
    tick(5);
    const second = await join(ctx('claude-code@auth'));
    tick(5);
    const third = await join(ctx('claude-code@auth'));

    for (const briefing of [first, second, third]) expect(briefing.text).toContain(id);

    const watermark = await lounge.readWatermark('claude-code@auth');
    expect(watermark!.since).toBe(nowIso(new Date(2026, 8, 13, 10, 0, 0)));
  });

  it('T8 — 지목된 항목은 워터마크 이전이어도 대상에게 뜬다', async () => {
    // 아직 한 번도 들어온 적 없는 actor 를 지목해 둔다
    const { id } = await write('codex', { to: ['claude-code@ui'] });

    tick(30);
    const briefing = await join(ctx('claude-code@ui'));
    expect(briefing.text).toContain(id);

    // 지목되지 않은 actor 에게는 뜨지 않는다. to 가 비어 있지 않으면 대상만 본다.
    const other = await join(ctx('codex'));
    expect(other.text).not.toContain(id);
  });

  it('T9 — ref 파일이 바뀌면 join 브리핑에 stale 이 붙는다', async () => {
    await mkdir(resolve(root, 'docs'), { recursive: true });
    await writeFile(resolve(root, 'docs/api.md'), '처음 내용\n');

    await join(ctx('claude-code@auth'));
    tick(1);
    const { id } = await write('codex', { refs: ['docs/api.md'] });

    const before = await lounge.readEntry(id);
    expect(before.entry.refs[0]!.sha).toBe(await refShaOf(root, 'docs/api.md'));

    tick(1);
    expect((await join(ctx('claude-code@auth'))).text).not.toContain('[stale]');

    await writeFile(resolve(root, 'docs/api.md'), '바뀐 내용\n');
    tick(1);
    const after = await join(ctx('claude-code@auth'));
    expect(after.text).toContain('[stale]');

    // 계산만 하고 저장하지 않는다 — 라운지가 아니라 코드가 진실이다
    const stored = await lounge.readEntry(id);
    expect(stored.entry.refs[0]!.sha).toBe(before.entry.refs[0]!.sha);
  });

  it('T10 — applied 한 항목이 대체되면 강제로 경고한다', async () => {
    await join(ctx('claude-code@auth'));
    tick(1);
    const first = await write('codex', { title: '첫 결정' });

    tick(1);
    await ack(ctx('claude-code@auth'), { entry: first.id, state: 'applied', note: '반영함' });

    tick(1);
    const second = await write('codex', { title: '뒤집은 결정', supersedes: first.id });

    tick(1);
    const briefing = await join(ctx('claude-code@auth'));
    expect(briefing.text).toContain('# 경고');
    expect(briefing.text).toContain(first.id);
    expect(briefing.text).toContain('대체됐습니다');
    // 대체 항목 자체는 미확인으로도 떠야 한다
    expect(briefing.text).toContain(second.id);
  });

  it('T11 — 강제 종료된 세션은 다음 호출 때 abandoned 가 되고 시스템 항목이 남는다', async () => {
    const gone = ctx('codex');
    await join(gone);

    // 이미 들어와 있던 사람. 워터마크가 시스템 항목보다 앞선다.
    tick(1);
    await join(ctx('claude-code@auth'));

    // idleMinutes 기본 30분을 넘긴다
    tick(45);
    const result = await join(ctx('claude-code@auth'));

    const sessions = await lounge.listSessions();
    expect(sessions.find((s) => s.id === gone.sessionId)!.state).toBe('abandoned');

    // 같은 actor 의 이전 세션도 반납 없이 끊긴 것이므로 함께 쓸린다
    expect(result.swept.map((s) => s.session.actor).sort()).toEqual([
      'claude-code@auth',
      'codex',
    ]);

    const systemId = result.swept.find((s) => s.session.actor === 'codex')!.entryId!;
    expect(systemId).toContain('-system');

    const entry = await lounge.readEntry(systemId);
    expect(entry.entry.by).toBe('system');
    expect(entry.entry.about).toContain('codex');

    // 이미 합류해 있던 사람에게는 미확인으로 뜬다
    expect(result.text).toContain(systemId);
  });

  /**
   * 스윕을 일으킨 사람이 그때 처음 들어온 경우, 시스템 항목의 시각과 방금
   * 만든 워터마크가 같다. 경계가 포함이므로 **자기가 일으킨 정리도 보인다.**
   * 합류하는 순간에 생긴 항목은 과거가 아니다.
   */
  it('T11c — 최초 입장이 일으킨 스윕의 시스템 항목도 미확인으로 뜬다', async () => {
    await join(ctx('codex'));
    tick(45);

    const result = await join(ctx('claude-code@ui'));
    const systemId = result.swept[0]!.entryId!;
    expect(systemId).toContain('-system');
    expect(result.text).toContain(systemId);
    expect(result.text).toContain('미확인 1건');
  });

  it('T11d — 워터마크와 같은 시각의 항목은 잘리지 않는다', async () => {
    // 경계가 배타적이면 합류와 같은 초에 올라온 항목이 영영 묻힌다
    const { id } = await write('codex');
    const briefing = await join(ctx('claude-code@ui'));
    expect(briefing.text).toContain(id);
  });

  it('T11b — resume 을 남긴 세션은 시스템 항목을 만들지 않는다', async () => {
    const gone = ctx('codex');
    await join(gone);
    await lounge.writeResume('codex', '여기까지 했습니다');

    tick(45);
    const result = await join(ctx('claude-code@auth'));
    expect(result.swept).toHaveLength(1);
    expect(result.swept[0]!.entryId).toBeNull();
  });

  it('T12 — 같은 분에 둘이 post 해도 id 가 충돌하지 않는다', async () => {
    const a = await write('codex', { title: 'A' });
    const b = await write('claude-code@auth', { title: 'B' });
    const c = await write('codex', { title: 'C' });

    const ids = [a.id, b.id, c.id];
    expect(new Set(ids).size).toBe(3);
    // 같은 actor 가 같은 분에 두 번 쓰면 -2 가 붙는다
    expect(c.id).toBe(`${a.id}-2`);
    expect(await lounge.listEntryIds()).toHaveLength(3);
  });

  it('T13 — @auth 가 ack 해도 @ui 에게는 미확인으로 남는다', async () => {
    await join(ctx('claude-code@auth'));
    await join(ctx('claude-code@ui'));
    tick(1);
    const { id } = await write('codex');

    tick(1);
    await ack(ctx('claude-code@auth'), { entry: id, state: 'applied', note: '반영함' });

    tick(1);
    expect((await join(ctx('claude-code@auth'))).text).not.toContain(id);
    expect((await join(ctx('claude-code@ui'))).text).toContain(id);
  });

  it('T16 — 최악의 경우에도 브리핑이 500토큰을 넘지 않는다', async () => {
    const me = 'claude-code@auth';
    await join(ctx(me));
    tick(1);

    // 상한을 꽉 채운 항목 8건 + 경고 + 대기 해제 + resume
    const blocked = await write('codex', { title: '막힌 항목' });
    const blocker = await write('codex', { title: '막고 있던 항목' });
    await ack(ctx(me), { entry: blocked.id, state: 'blocked', waiting_on: blocker.id });
    await ack(ctx(me), { entry: blocker.id, state: 'applied', note: '반영함' });
    await write('codex', { title: '뒤집은 결정', supersedes: blocker.id });

    for (let n = 1; n <= 8; n += 1) {
      tick(1);
      await write('codex', {
        title: '가'.repeat(60),
        about: '나'.repeat(120),
        body: BODY,
      });
    }
    await lounge.writeResume(me, Array.from({ length: 12 }, (_, i) => `${i}번째 줄`).join('\n'));

    tick(1);
    const briefing = await join(ctx(me));
    const actual = encoder.encode(briefing.text).length;

    expect(actual, `실측 ${actual}토큰:\n${briefing.text}`).toBeLessThanOrEqual(TOKEN_BUDGET);
    // 추정이 실측보다 적으면 상한을 넘겨놓고 통과했다고 착각하게 된다
    expect(briefing.tokens).toBeGreaterThanOrEqual(actual);
    expect(briefing.trimmed).toBe(true);
    // 접었더라도 경고는 남아 있어야 한다
    expect(briefing.text).toContain('# 경고');
  });

  it('T16b — 미확인이 없으면 3줄 이하로 끝낸다', async () => {
    const briefing = await join(ctx('codex'));
    expect(briefing.text.split('\n').filter(Boolean)).toHaveLength(1);
    expect(briefing.text).toContain('미확인 없음');
    expect(encoder.encode(briefing.text).length).toBeLessThan(40);
  });
});

describe('추정기', () => {
  it('실측보다 적게 잡지 않는다', () => {
    const samples = [
      '미확인 3건',
      '- 20260913-1015-codex api/auth [stale]',
      '  auth 엔드포인트 3개의 요청과 응답 형태, 에러코드 체계',
      '가'.repeat(120),
      'the quick brown fox jumps over the lazy dog',
      '# 경고\n- 20260912-1652-codex 첫 결정\n  반영했는데 이 항목이 대체됐습니다.',
    ];
    for (const sample of samples) {
      expect(estimateTokens(sample), sample.slice(0, 24)).toBeGreaterThanOrEqual(
        encoder.encode(sample).length,
      );
    }
  });
});
