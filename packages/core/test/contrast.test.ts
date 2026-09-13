/**
 * 글자색이 바탕에서 읽히는지 잰다.
 *
 * 색을 고르는 일은 눈짐작으로 하기 쉽고, 한 번 틀리면 화면을 띄우기 전까지
 * 아무도 모른다. 실제로 처음 고른 light 의 `signal` 은 3.05:1 이었고
 * 상태 라벨이 흰 카드 위에서 거의 보이지 않았다.
 *
 * 상태 라벨은 12px 다. WCAG 의 큰 글자 예외(3:1)에 해당하지 않으므로 4.5:1 을 쓴다.
 */
import { COLORS } from '../src/tokens.js';
import { describe, expect, it } from 'vitest';

const MINIMUM = 4.5;

/** 글자로 쓰이는 색. 바탕으로만 쓰이는 paper, card, line 은 뺀다. */
const TEXT_COLORS = ['ink', 'muted', 'live', 'signal', 'alert'] as const;

/** 글자가 놓이는 바탕. */
const SURFACES = ['card', 'paper'] as const;

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG 상대 휘도. */
export function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16)));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high! + 0.05) / (low! + 0.05);
}

describe('대비', () => {
  it('알려진 값이 맞다', () => {
    // 계산이 틀리면 아래 검사가 전부 거짓으로 통과한다
    expect(contrast('#FFFFFF', '#000000')).toBeCloseTo(21, 1);
    expect(contrast('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
  });

  for (const mode of ['light', 'dark'] as const) {
    for (const name of TEXT_COLORS) {
      for (const surface of SURFACES) {
        it(`${mode} 의 ${name} 이 ${surface} 위에서 읽힌다`, () => {
          const fg = COLORS[name]![mode];
          const bg = COLORS[surface]![mode];
          const ratio = contrast(fg, bg);
          expect(
            ratio,
            `${fg} on ${bg} 는 ${ratio.toFixed(2)}:1 입니다. ${MINIMUM}:1 이 필요합니다. ` +
              `tokens.ts 에서 명도를 조정하세요.`,
          ).toBeGreaterThanOrEqual(MINIMUM);
        });
      }
    }
  }

  it('바탕끼리는 구분된다', () => {
    // paper 와 card 가 같아 보이면 재실 패널이 배경에 묻힌다
    for (const mode of ['light', 'dark'] as const) {
      expect(contrast(COLORS.card![mode], COLORS.paper![mode])).toBeGreaterThan(1.05);
    }
  });
});
