/**
 * 백엔드를 실제로 띄워서 확인한다.
 *
 * P1 완료 조건 "손으로 파일을 고치면 1초 안에 화면이 바뀐다" 의 앞 절반이
 * 여기서 기계로 검증된다 — 파일을 고치면 SSE 가 1초 안에 알리는가.
 * 뒤 절반(브라우저가 그걸 받아 다시 그리는 것)은 사람이 눈으로 봐야 한다.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createViewerServer } from '../server/index.js';
import { closeAllChanges } from '../server/watch.js';

/** SSE 가 변경을 알리기까지 기다려 줄 시간. 완료 조건이 1초다. */
const CHANGE_BUDGET_MS = 1000;

let root: string;
let server: Server;
let origin: string;

function entryFile(id: string, at: string): string {
  return [
    '---',
    `id: ${id}`,
    'by: codex',
    `at: ${at}`,
    'area: test',
    'title: 손으로 넣은 항목',
    'about: 백엔드가 이걸 읽어 내는지 본다',
    'state: open',
    '---',
    '',
    '본문',
    '',
  ].join('\n');
}

beforeAll(async () => {
  root = await mkdtemp(resolve(tmpdir(), 'lounge-server-'));
  await mkdir(resolve(root, '.lounge/entries'), { recursive: true });
  await writeFile(resolve(root, '.lounge/config.json'), '{"project":"서버시험"}');
  await writeFile(
    resolve(root, '.lounge/entries/20260913-1000-codex.md'),
    entryFile('20260913-1000-codex', '2026-09-13T10:00:00+09:00'),
  );

  server = createViewerServer({ defaultProject: root });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (typeof address === 'string' || address === null) throw new Error('주소를 얻지 못했습니다');
  origin = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await closeAllChanges();
  await new Promise<void>((done) => server.close(() => done()));
  await rm(root, { recursive: true, force: true });
});

describe('읽기', () => {
  it('기본 프로젝트를 알려준다', async () => {
    const body = await (await fetch(`${origin}/api/default`)).json();
    expect(body).toEqual({ project: root });
  });

  it('스냅숏을 낸다', async () => {
    const response = await fetch(`${origin}/api/snapshot`);
    expect(response.status).toBe(200);
    const snapshot = await response.json();
    expect(snapshot.projectName).toBe('서버시험');
    expect(snapshot.entries).toHaveLength(1);
    expect(snapshot.entries[0].label).toBe('열림');
  });

  it('CORS 를 열어두지 않는다', async () => {
    // 열어두면 다른 출처의 페이지가 이 서버로 로컬 파일을 읽어 갈 수 있다
    const response = await fetch(`${origin}/api/snapshot`);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('라운지 없는 폴더는 404 다', async () => {
    const bare = await mkdtemp(resolve(tmpdir(), 'lounge-bare-'));
    const response = await fetch(`${origin}/api/snapshot?project=${encodeURIComponent(bare)}`);
    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe('no-lounge');
    await rm(bare, { recursive: true, force: true });
  });
});

describe('쓰기', () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    it(`${method} 는 405 로 끊는다`, async () => {
      const response = await fetch(`${origin}/api/snapshot`, { method });
      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toBe('GET, HEAD');
    });
  }
});

describe('변경 알림', () => {
  it('파일을 고치면 1초 안에 알린다', async () => {
    const response = await fetch(`${origin}/api/events`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    /** 다음 이벤트 이름이 나올 때까지 읽는다. */
    const waitFor = async (name: string, budget: number): Promise<boolean> => {
      const deadline = Date.now() + budget;
      let buffer = '';
      while (Date.now() < deadline) {
        const race = await Promise.race([
          reader.read(),
          new Promise<null>((r) => setTimeout(() => r(null), deadline - Date.now())),
        ]);
        if (!race || race.done) return false;
        buffer += decoder.decode(race.value, { stream: true });
        if (buffer.includes(`event: ${name}`)) return true;
      }
      return false;
    };

    expect(await waitFor('ready', 2000), '감시 준비 신호가 오지 않았습니다').toBe(true);

    await writeFile(
      resolve(root, '.lounge/entries/20260913-1130-codex.md'),
      entryFile('20260913-1130-codex', '2026-09-13T11:30:00+09:00'),
    );

    expect(
      await waitFor('changed', CHANGE_BUDGET_MS),
      `파일 변경을 ${CHANGE_BUDGET_MS}ms 안에 알리지 못했습니다`,
    ).toBe(true);

    await reader.cancel();
  });

  it('알린 뒤의 스냅숏에 새 항목이 있다', async () => {
    const snapshot = await (await fetch(`${origin}/api/snapshot`)).json();
    expect(snapshot.entries.map((e: { entry: { id: string } }) => e.entry.id)).toEqual([
      '20260913-1130-codex',
      '20260913-1000-codex',
    ]);
  });
});
