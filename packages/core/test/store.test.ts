import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { refSha } from '../src/sha.js';
import { Lounge, openLounge } from '../src/store.js';
import { entryId } from '../src/types.js';

let root: string;
let lounge: Lounge;

const baseEntry = {
  id: '20260913-1015-codex',
  by: 'codex',
  at: '2026-09-13T10:15:00+09:00',
  area: 'api/auth',
  title: '로그인 API 응답 스펙 확정',
  about: 'auth 엔드포인트 3개의 요청과 응답 형태, 에러코드 체계',
  to: ['claude-code@auth'],
  state: 'open' as const,
  refs: [],
  supersedes: null,
  reply_to: null,
};

beforeEach(async () => {
  root = await mkdtemp(resolve(tmpdir(), 'lounge-store-'));
  await mkdir(resolve(root, '.lounge'), { recursive: true });
  lounge = openLounge(resolve(root, '.lounge'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('항목', () => {
  it('쓴 것을 그대로 읽는다', async () => {
    await lounge.writeEntry(baseEntry, '본문 한 줄\n');
    const doc = await lounge.readEntry(baseEntry.id);
    expect(doc.entry).toEqual(baseEntry);
    expect(doc.body).toBe('본문 한 줄');
  });

  // T1 — about 없이 post 하면 거부
  it('about 이 없으면 거부한다', async () => {
    const { about: _about, ...noAbout } = baseEntry;
    await expect(lounge.writeEntry(noAbout, '')).rejects.toThrow();
  });

  // T2 — about 130자면 거부. 자르지 않는다
  it('about 이 120자를 넘으면 자르지 않고 거부한다', async () => {
    const long = { ...baseEntry, about: 'ㄱ'.repeat(130) };
    await expect(lounge.writeEntry(long, '')).rejects.toThrow();
    expect(await lounge.listEntryIds()).toEqual([]);
  });

  it('title 이 60자를 넘으면 거부한다', async () => {
    await expect(lounge.writeEntry({ ...baseEntry, title: 'ㄱ'.repeat(61) }, '')).rejects.toThrow();
  });

  it('actor 에 허용되지 않은 문자가 있으면 거부한다', async () => {
    await expect(lounge.writeEntry({ ...baseEntry, by: 'Claude Code' }, '')).rejects.toThrow();
  });

  it('id 오름차순으로 나열한다', async () => {
    await lounge.writeEntry(baseEntry, '');
    await lounge.writeEntry({ ...baseEntry, id: '20260912-0900-codex', at: '2026-09-12T09:00:00+09:00' }, '');
    expect(await lounge.listEntryIds()).toEqual(['20260912-0900-codex', '20260913-1015-codex']);
  });

  // T12 — 같은 분에 두 번 써도 id 가 겹치지 않는다
  it('같은 분에 같은 actor 가 또 쓰면 -2 를 붙인다', async () => {
    const at = new Date(2026, 8, 13, 10, 15);
    expect(await lounge.nextEntryId(at, 'codex')).toBe(entryId(at, 'codex'));
    await lounge.writeEntry(baseEntry, '');
    expect(await lounge.nextEntryId(at, 'codex')).toBe('20260913-1015-codex-2');
  });

  it('계약을 벗어난 파일은 어느 파일인지 알려주며 거부한다', async () => {
    await mkdir(lounge.path('entries'), { recursive: true });
    await writeFile(lounge.path('entries/20260913-1015-codex.md'), '머리말 없는 파일');
    await expect(lounge.readEntry('20260913-1015-codex')).rejects.toThrow(/20260913-1015-codex\.md/);
  });
});

describe('응답', () => {
  // T3 — blocked 인데 waiting_on 이 없으면 거부
  it('blocked 에는 waiting_on 이 있어야 한다', async () => {
    const ack = { entry: baseEntry.id, actor: 'claude-code@auth', state: 'blocked' as const };
    await expect(lounge.writeAck(ack)).rejects.toThrow();
    await expect(lounge.writeAck({ ...ack, waiting_on: '20260912-0900-codex' })).resolves.toBeTruthy();
  });

  // T13 — actor 별로 따로 쌓인다
  it('actor 마다 따로 남는다', async () => {
    await lounge.writeAck({ entry: baseEntry.id, actor: 'claude-code@auth', state: 'applied' });
    expect(await lounge.listAckActors(baseEntry.id)).toEqual(['claude-code@auth']);
    expect(await lounge.readAck(baseEntry.id, 'claude-code@ui')).toBeNull();
  });
});

describe('워터마크', () => {
  // 입장마다 갱신하면 이전 세션의 미확인이 증발한다
  it('한 번 만들어지면 움직이지 않는다', async () => {
    const first = await lounge.ensureWatermark('codex', '2026-09-13T11:02:00+09:00');
    const second = await lounge.ensureWatermark('codex', '2026-09-14T09:00:00+09:00');
    expect(second.since).toBe(first.since);
  });
});

describe('stale', () => {
  // T9 — ref 파일이 바뀌면 stale
  it('ref 가 바뀌면 경로를 짚어낸다', async () => {
    const target = resolve(root, 'docs/api.md');
    await mkdir(resolve(root, 'docs'), { recursive: true });
    await writeFile(target, '처음 내용\n');

    const sha = await refSha(root, 'docs/api.md');
    const entry = { ...baseEntry, refs: [{ path: 'docs/api.md', sha: sha! }] };
    const { entry: written } = await lounge.writeEntry(entry, '');
    expect(await lounge.isStale(written)).toBe(false);

    await writeFile(target, '바뀐 내용\n');
    expect(await lounge.staleRefs(written)).toEqual(['docs/api.md']);
  });

  it('ref 파일이 사라져도 stale 이다', async () => {
    const entry = { ...baseEntry, refs: [{ path: 'docs/없는파일.md', sha: 'deadbeef' }] };
    const { entry: written } = await lounge.writeEntry(entry, '');
    expect(await lounge.isStale(written)).toBe(true);
  });
});
