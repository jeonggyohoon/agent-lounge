import { describe, expect, it } from 'vitest';
import { agoOf, clockOf, dayOf } from '../src/lib/time.js';

const now = new Date('2026-09-13T16:00:00+09:00').getTime();
const ago = (ms: number) => new Date(now - ms).toISOString();

describe('상대 시각', () => {
  it('1분 안쪽은 방금', () => {
    expect(agoOf(ago(0), now)).toBe('방금');
    expect(agoOf(ago(59_000), now)).toBe('방금');
  });

  it('분, 시간, 일로 올라간다', () => {
    expect(agoOf(ago(2 * 60_000), now)).toBe('2분 전');
    expect(agoOf(ago(3 * 3_600_000), now)).toBe('3시간 전');
    expect(agoOf(ago(2 * 86_400_000), now)).toBe('2일 전');
  });

  it('미래 시각도 방금으로 둔다', () => {
    // 시계가 어긋난 머신이 남긴 값에 "-3분 전"을 띄우지 않는다
    expect(agoOf(new Date(now + 60_000).toISOString(), now)).toBe('방금');
  });

  it('깨진 값에는 빈 문자열', () => {
    expect(agoOf('어제쯤', now)).toBe('');
  });
});

describe('시각 표기', () => {
  it('HH:MM 으로 쓴다', () => {
    expect(clockOf('2026-09-13T09:05:00+09:00')).toMatch(/^\d{2}:\d{2}$/);
  });

  it('깨진 값에는 자리를 남긴다', () => {
    expect(clockOf('없음')).toBe('--:--');
  });

  it('오늘이면 날짜를 붙이지 않는다', () => {
    expect(dayOf(new Date(now).toISOString(), now)).toBeNull();
  });

  it('어제면 날짜를 붙인다', () => {
    expect(dayOf(ago(86_400_000), now)).toBe('09.12');
  });
});
