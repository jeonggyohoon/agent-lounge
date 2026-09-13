/**
 * 이 저장소의 진짜 `.lounge/` 를 검증한다.
 *
 * P0 의 항목은 도구 없이 손으로 썼다. 손으로 쓴 것이 계약에 맞는지는
 * 사람이 훑어서 확인할 일이 아니다.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LIMITS } from '../src/types.js';
import { discoverLounge } from '../src/fs.js';

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
    expect(docs.length).toBeGreaterThanOrEqual(5);
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

  /**
   * **stale 은 오류가 아니다.** 코드가 움직이면 붙는 정상 상태이고 화면에
   * 표시된다. 여기서 막을 것은 가리키는 파일이 아예 사라진 경우뿐이다 —
   * 그건 stale 이 아니라 항목이 깨진 것이다.
   */
  it('ref 가 가리키는 파일이 실제로 있다', async () => {
    for (const { entry } of await lounge.listEntries()) {
      for (const ref of entry.refs) {
        const file = resolve(lounge.projectRoot, ref.path);
        expect(existsSync(file), `${entry.id} 의 ref ${ref.path} 가 없습니다`).toBe(true);
      }
    }
  });

  it('reply_to 가 가리키는 항목이 실제로 있다', async () => {
    for (const { entry } of await lounge.listEntries()) {
      if (!entry.reply_to) continue;
      expect(await lounge.tryReadEntry(entry.reply_to), `${entry.reply_to} 가 없습니다`).not.toBeNull();
    }
  });
});
