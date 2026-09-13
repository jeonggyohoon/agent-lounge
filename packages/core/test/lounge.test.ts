/**
 * 이 저장소의 진짜 `.lounge/` 를 검증한다.
 *
 * P0 의 항목은 도구 없이 손으로 썼다. 손으로 쓴 것이 계약에 맞는지는
 * 사람이 훑어서 확인할 일이 아니다.
 */
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LIMITS } from '../src/types.js';
import { discoverLounge } from '../src/store.js';

const lounge = await discoverLounge(resolve(import.meta.dirname, '..'));

describe('이 저장소의 라운지', () => {
  it('저장소 안에서 찾아진다', () => {
    expect(lounge.dir).toMatch(/[\\/]\.lounge$/);
  });

  it('config 가 계약대로다', async () => {
    const config = await lounge.readConfig();
    expect(config.project).toBe('lounge');
    expect(config.briefing.aboutMaxLength).toBe(LIMITS.aboutMaxLength);
  });

  it('항목이 전부 EntrySchema 를 통과한다', async () => {
    const docs = await lounge.listEntries();
    expect(docs.length).toBeGreaterThanOrEqual(4);
  });

  it('파일명과 머리말의 id 가 같다', async () => {
    for (const id of await lounge.listEntryIds()) {
      expect((await lounge.readEntry(id)).entry.id).toBe(id);
    }
  });

  it('id 의 시각이 at 과 맞는다', async () => {
    for (const { entry } of await lounge.listEntries()) {
      const stamp = new Date(entry.at);
      const p = (n: number) => String(n).padStart(2, '0');
      const expected =
        `${stamp.getFullYear()}${p(stamp.getMonth() + 1)}${p(stamp.getDate())}` +
        `-${p(stamp.getHours())}${p(stamp.getMinutes())}`;
      expect(entry.id.startsWith(`${expected}-${entry.by}`)).toBe(true);
    }
  });

  it('about 이 비어 있지 않고 120자를 넘지 않는다', async () => {
    for (const { entry } of await lounge.listEntries()) {
      expect(entry.about.trim().length).toBeGreaterThan(0);
      expect(entry.about.length).toBeLessThanOrEqual(LIMITS.aboutMaxLength);
    }
  });

  it('supersedes 가 가리키는 항목이 실제로 있고 superseded 다', async () => {
    for (const { entry } of await lounge.listEntries()) {
      if (!entry.supersedes) continue;
      const target = await lounge.tryReadEntry(entry.supersedes);
      expect(target, `${entry.supersedes} 가 없습니다`).not.toBeNull();
      expect(target!.entry.state).toBe('superseded');
    }
  });

  it('본문이 비어 있지 않다', async () => {
    for (const { entry, body } of await lounge.listEntries()) {
      expect(body.length, `${entry.id} 의 본문이 비었습니다`).toBeGreaterThan(0);
    }
  });

  it('ref 가 현재 코드와 어긋나지 않는다', async () => {
    for (const { entry } of await lounge.listEntries()) {
      expect(await lounge.staleRefs(entry), `${entry.id} 의 ref`).toEqual([]);
    }
  });
});
