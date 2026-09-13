import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LoungeNotFoundError } from '../src/discover.js';
import { findLounge, openLounge, tryFindLounge } from '../src/fs.js';

let root: string;
let deep: string;

beforeAll(async () => {
  root = await mkdtemp(resolve(tmpdir(), 'lounge-test-'));
  deep = resolve(root, 'packages/core/src');
  await mkdir(deep, { recursive: true });
  await mkdir(resolve(root, '.lounge/entries'), { recursive: true });
  await writeFile(resolve(root, '.lounge/config.json'), '{"project":"t"}');
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('라운지 탐색', () => {
  // T14 — 하위 폴더에서 실행해도 같은 라운지에 붙는다
  it('하위 폴더에서 위로 올라가 찾는다', async () => {
    expect(await findLounge(deep)).toBe(await findLounge(root));
  });

  // T15 — 라운지 없는 폴더에서는 실패한다. 조용히 만들지 않는다
  it('못 찾으면 던지고 폴더를 만들지 않는다', async () => {
    const bare = await mkdtemp(resolve(tmpdir(), 'lounge-bare-'));
    await expect(findLounge(bare)).rejects.toThrow(LoungeNotFoundError);
    expect(await tryFindLounge(bare)).toBeNull();
    await rm(bare, { recursive: true, force: true });
  });

  it('프로젝트 루트는 라운지의 부모다', async () => {
    const lounge = openLounge(await findLounge(deep));
    expect(lounge.projectRoot).toBe(resolve(lounge.dir, '..'));
  });

  it('config 가 없어도 기본값으로 읽힌다', async () => {
    const lounge = openLounge(await findLounge(root));
    const config = await lounge.readConfig();
    expect(config.project).toBe('t');
    expect(config.briefing.maxUnread).toBe(5);
    expect(config.sweep.idleMinutes).toBe(30);
  });
});
