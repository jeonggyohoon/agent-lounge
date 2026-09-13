/**
 * 시각 표시.
 *
 * 상황판은 흘깃 보는 화면이다. "2026-09-13T16:20:00+09:00" 은 읽는 데 시간이
 * 걸리고, 읽고 나서 또 지금과 빼야 한다. 재실 패널에는 상대 시각을 쓴다.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** `HH:MM`. 타임라인의 항목 시각. */
export function clockOf(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '--:--';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/**
 * "방금", "2분 전", "3시간 전", "2일 전".
 * 초 단위는 쓰지 않는다 — 1초마다 바뀌는 숫자는 흘깃 보는 화면에서 소음이다.
 */
export function agoOf(iso: string, now: number = Date.now()): string {
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return '';

  const elapsed = now - at;
  if (elapsed < 0) return '방금';
  if (elapsed < MINUTE) return '방금';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}분 전`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}시간 전`;
  return `${Math.floor(elapsed / DAY)}일 전`;
}

/** 오늘이 아니면 날짜를 덧붙인다. 어제 항목을 오늘 것으로 읽는 사고를 막는다. */
export function dayOf(iso: string, now: number = Date.now()): string | null {
  const at = new Date(iso);
  const today = new Date(now);
  if (Number.isNaN(at.getTime())) return null;
  const sameDay =
    at.getFullYear() === today.getFullYear() &&
    at.getMonth() === today.getMonth() &&
    at.getDate() === today.getDate();
  if (sameDay) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(at.getMonth() + 1)}.${pad(at.getDate())}`;
}
