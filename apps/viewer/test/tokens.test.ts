/**
 * 화면 코드에 hex 값과 px 값을 직접 쓰지 않는다.
 *
 * 이걸 지키지 못하면 "새 상태가 생기면 tokens.ts 한 곳만 고친다"가 거짓말이 된다.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { COLORS, SPACE, cssVariables } from '@lounge/core';
import { describe, expect, it } from 'vitest';
import { tokenStylesheet } from '../src/theme.js';

const appRoot = resolve(import.meta.dirname, '..');
const css = readFileSync(join(appRoot, 'src/styles.css'), 'utf8');

/** 주석을 걷어낸 본문만 본다. 주석에 적힌 설명까지 걸 필요는 없다. */
const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

describe('styles.css', () => {
  it('hex 색을 쓰지 않는다', () => {
    expect(rules.match(/#[0-9a-fA-F]{3,8}\b/g)).toBeNull();
  });

  it('rgb/hsl 리터럴을 쓰지 않는다', () => {
    expect(rules.match(/\b(rgba?|hsla?)\s*\(/g)).toBeNull();
  });

  /**
   * 1px 만 허용한다. 경계선 두께는 간격 척도(4의 배수)에 속하지 않고
   * "화면에서 가장 얇은 선"을 뜻한다. var(--s-4) 로 쓰면 선이 아니라 띠가 된다.
   */
  it('1px 실선 말고는 px 를 쓰지 않는다', () => {
    const offenders = (rules.match(/\b\d+px\b/g) ?? []).filter((v) => v !== '1px');
    expect(offenders, `토큰을 쓰세요: ${offenders.join(', ')}`).toEqual([]);
  });

  it('쓰는 변수가 전부 토큰에 있다', () => {
    const used = new Set([...rules.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1]!));
    const defined = new Set(
      [...cssVariables('light').matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]!),
    );
    const missing = [...used].filter((name) => !defined.has(name));
    expect(missing, `tokens.ts 에 없는 변수: ${missing.join(', ')}`).toEqual([]);
  });
});

describe('컴포넌트', () => {
  const components = walk(join(appRoot, 'src')).filter((p) => extname(p) === '.tsx');

  it('hex 색을 쓰지 않는다', () => {
    for (const file of components) {
      expect(readFileSync(file, 'utf8').match(/#[0-9a-fA-F]{6}\b/g), file).toBeNull();
    }
  });

  it('상태 라벨을 하드코딩하지 않는다', () => {
    // 라벨은 tokens.ts 의 *_STATE_META 에서만 나와야 한다
    for (const file of components) {
      const text = readFileSync(file, 'utf8');
      for (const label of ['열림', '종결', '대체됨', '폐기', '반영함', '접속 중']) {
        expect(text.includes(`'${label}'`), `${file} 에 ${label} 이 박혀 있습니다`).toBe(false);
      }
    }
  });
});

describe('토큰 주입', () => {
  const sheet = tokenStylesheet();

  it('light 와 dark 를 모두 낸다', () => {
    expect(sheet).toContain(COLORS.ink!.light);
    expect(sheet).toContain(COLORS.ink!.dark);
    expect(sheet).toContain('prefers-color-scheme: dark');
  });

  it('간격 척도를 전부 낸다', () => {
    for (const step of SPACE) expect(sheet).toContain(`--s-${step}: ${step}px`);
  });
});
