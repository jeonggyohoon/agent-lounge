/**
 * 화면이 읽는 형태를 검증한다.
 *
 * 파일 시스템도 Tauri 도 없이 돈다 — `LoungeIO` 를 메모리로 끼우면 된다.
 * 포트를 뺀 덕에 생긴 이득이고, 이 테스트가 그 증거다.
 */
import { createHash } from 'node:crypto';
import { ReadonlyLounge, type LoungeIO } from '@lounge/core';
import { describe, expect, it } from 'vitest';
import { readSnapshot } from '../src/lib/snapshot.js';

/** 경로 → 내용. 폴더는 경로 앞머리로 판정한다. */
function memoryIO(files: Record<string, string>): LoungeIO {
  const encoder = new TextEncoder();
  const normal = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '');

  return {
    async readText(path) {
      return files[normal(path)] ?? null;
    },
    async readBytes(path) {
      const text = files[normal(path)];
      return text === undefined ? null : encoder.encode(text);
    },
    async listDir(path) {
      const prefix = `${normal(path)}/`;
      const names = new Set<string>();
      for (const key of Object.keys(files)) {
        if (!key.startsWith(prefix)) continue;
        names.add(key.slice(prefix.length).split('/')[0]!);
      }
      return [...names];
    },
    async exists(path) {
      const key = normal(path);
      return key in files || Object.keys(files).some((k) => k.startsWith(`${key}/`));
    },
    async isDirectory(path) {
      return Object.keys(files).some((k) => k.startsWith(`${normal(path)}/`));
    },
    async realpath(path) {
      return path;
    },
    async sha1(bytes) {
      return createHash('sha1').update(bytes).digest('hex');
    },
    async sha256(bytes) {
      return createHash('sha256').update(bytes).digest('hex');
    },
  };
}

function entryFile(fields: Record<string, string>, body = '본문'): string {
  const head = Object.entries(fields)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  return `---\n${head}\n---\n\n${body}\n`;
}

const files: Record<string, string> = {
  '/p/.lounge/config.json': '{"project":"testbed"}',
  '/p/.lounge/entries/20260913-0900-codex.md': entryFile({
    id: '20260913-0900-codex',
    by: 'codex',
    at: '2026-09-13T09:00:00+09:00',
    area: 'api',
    title: '먼저 쓴 항목',
    about: '오래된 쪽',
    state: 'resolved',
  }),
  '/p/.lounge/entries/20260913-1500-claude-code@ui.md': entryFile({
    id: '20260913-1500-claude-code@ui',
    by: 'claude-code@ui',
    at: '2026-09-13T15:00:00+09:00',
    area: 'ui',
    title: '나중에 쓴 항목',
    about: '새로운 쪽',
    state: 'open',
  }),
  '/p/.lounge/acks/20260913-0900-codex/claude-code@ui.json': JSON.stringify({
    entry: '20260913-0900-codex',
    actor: 'claude-code@ui',
    state: 'applied',
    note: '반영했다',
  }),
  '/p/.lounge/sessions/codex-01.json': JSON.stringify({
    id: 'codex-01',
    actor: 'codex',
    client: 'codex',
    cwd: '/p',
    joined_at: '2026-09-13T08:00:00+09:00',
    last_seen: '2026-09-13T08:10:00+09:00',
    state: 'left',
  }),
  '/p/.lounge/sessions/claude-code@ui-02.json': JSON.stringify({
    id: 'claude-code@ui-02',
    actor: 'claude-code@ui',
    client: 'claude-code',
    cwd: '/p',
    joined_at: '2026-09-13T14:00:00+09:00',
    last_seen: '2026-09-13T15:30:00+09:00',
    state: 'active',
  }),
};

const lounge = new ReadonlyLounge(memoryIO(files), '/p/.lounge');

describe('스냅숏', () => {
  it('config 의 이름을 쓴다', async () => {
    expect((await readSnapshot(lounge)).projectName).toBe('testbed');
  });

  it('항목은 최신이 위다', async () => {
    const { entries } = await readSnapshot(lounge);
    expect(entries.map((e) => e.entry.id)).toEqual([
      '20260913-1500-claude-code@ui',
      '20260913-0900-codex',
    ]);
  });

  it('상태 라벨과 tone 을 tokens.ts 에서 가져온다', async () => {
    const { entries } = await readSnapshot(lounge);
    expect(entries[0]).toMatchObject({ label: '열림', tone: 'signal' });
    expect(entries[1]).toMatchObject({ label: '종결', tone: 'live' });
  });

  it('항목에 ack 를 붙인다', async () => {
    const { entries } = await readSnapshot(lounge);
    expect(entries[1]!.acks.map((a) => a.actor)).toEqual(['claude-code@ui']);
  });

  it('접속 중인 사람이 위다', async () => {
    const { presence } = await readSnapshot(lounge);
    expect(presence.map((p) => p.session.actor)).toEqual(['claude-code@ui', 'codex']);
    expect(presence[0]).toMatchObject({ label: '접속 중', tone: 'live', entryCount: 1 });
    expect(presence[1]).toMatchObject({ label: '나감', tone: 'muted' });
  });

  it('ref 가 없으면 stale 이 빈 배열이다', async () => {
    const { entries } = await readSnapshot(lounge);
    for (const view of entries) expect(view.staleRefs).toEqual([]);
  });

  it('라운지가 비어 있어도 무너지지 않는다', async () => {
    const bare = new ReadonlyLounge(memoryIO({}), '/q/.lounge');
    const snapshot = await readSnapshot(bare);
    expect(snapshot.entries).toEqual([]);
    expect(snapshot.presence).toEqual([]);
    expect(snapshot.projectName).toBe('q');
  });
});
