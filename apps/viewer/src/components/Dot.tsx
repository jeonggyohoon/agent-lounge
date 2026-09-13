import type { Tone } from '@lounge/core';

/**
 * 재실 점.
 *
 * **점은 재실에만 쓴다.** 항목 상태에도 점을 쓰면 어느 쪽이 사람인지 헷갈린다.
 * `live` 만 채우고 나머지는 테두리만 남긴다.
 */
export function Dot({ tone, blink }: { tone: Tone; blink: boolean }) {
  return (
    <span
      className={`dot dot--${tone}${blink ? ' dot--blink' : ''}`}
      data-filled={tone === 'live' ? 'true' : 'false'}
      aria-hidden="true"
    />
  );
}
