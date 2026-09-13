/**
 * 뷰어는 쓰지 않는다.
 *
 * 문서에만 적어두면 언젠가 깨진다. 세 겹으로 막는다.
 *
 * 1. 백엔드가 `ReadonlyLounge` 만 만든다 — 쓰기 메서드가 객체에 없다 (타입)
 * 2. 라우트 표에 쓰기 엔드포인트가 없고 GET 외의 메서드는 405 다 (라우트)
 * 3. 소스에 `@lounge/core/fs` 와 쓰기 API 가 없다 (이 테스트)
 *
 * 2번이 Tauri 권한 목록이 하던 자리다. 껍데기가 바뀌어도 겹 수는 그대로다.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROUTES } from '../server/routes.js';

const appRoot = resolve(import.meta.dirname, '..');
const srcRoot = join(appRoot, 'src');
const serverRoot = join(appRoot, 'server');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const sources = walk(srcRoot).filter((p) => ['.ts', '.tsx'].includes(extname(p)));

/**
 * 주석을 걷어낸 본문.
 *
 * "여기서는 쓰기를 하지 않는다" 같은 설명까지 걸면 규칙을 적어둘 수가 없다.
 * 검사 대상은 실제로 도는 코드다.
 */
function codeOf(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join('\n');
}

/** 파일을 바꾸는 API. 이름만 나와도 걸리게 둔다. */
const WRITE_APIS = [
  'writeTextFile',
  'writeFile',
  'mkdir',
  'rename',
  'copyFile',
  'truncate',
  'writeEntry',
  'writeAck',
  'writeSession',
  'writeResume',
  'ensureWatermark',
];

describe('프런트엔드 소스', () => {
  it('읽을 파일이 있다', () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  it('@lounge/core/fs 를 import 하지 않는다', () => {
    for (const file of sources) {
      expect(
        codeOf(file).includes('@lounge/core/fs'),
        `${file} 가 node 어댑터를 import 합니다. 쓰기 함수가 전부 그 뒤에 있습니다.`,
      ).toBe(false);
    }
  });

  it('파일을 직접 열지 않는다', () => {
    // 프런트엔드는 백엔드가 만든 스냅숏만 받는다
    for (const file of sources) {
      expect(codeOf(file).includes('node:fs'), `${file} 가 파일을 직접 엽니다`).toBe(false);
    }
  });

  it('쓰기 API 이름이 나오지 않는다', () => {
    for (const file of sources) {
      const text = codeOf(file);
      for (const api of WRITE_APIS) {
        expect(text.includes(api), `${file} 에 ${api} 가 있습니다`).toBe(false);
      }
    }
  });
});

describe('백엔드 소스', () => {
  const serverSources = walk(serverRoot).filter((p) => extname(p) === '.ts');

  it('쓰기 API 이름이 나오지 않는다', () => {
    for (const file of serverSources) {
      const text = codeOf(file);
      for (const api of WRITE_APIS) {
        expect(text.includes(api), `${file} 에 ${api} 가 있습니다`).toBe(false);
      }
    }
  });

  it('Lounge 를 만들지 않는다', () => {
    // ReadonlyLounge 만 쓴다. Lounge 를 만드는 순간 쓰기 메서드가 딸려 온다.
    for (const file of serverSources) {
      expect(codeOf(file).includes('openLounge'), file).toBe(false);
      expect(codeOf(file).includes('discoverLounge'), file).toBe(false);
      expect(codeOf(file).includes('LoungeWriteIO'), file).toBe(false);
    }
  });
});

describe('라우트 표', () => {
  it('전부 GET 이다', () => {
    const others = ROUTES.filter((route) => route.method !== 'GET');
    expect(others.map((r) => `${r.method} ${r.path}`), '쓰기 라우트가 있습니다').toEqual([]);
  });

  it('경로 이름에 쓰기 동사가 없다', () => {
    const suspicious = ROUTES.filter((route) =>
      /write|post|create|update|delete|ack|remove/.test(route.path),
    );
    expect(suspicious.map((r) => r.path)).toEqual([]);
  });

  it('읽는 데 필요한 것은 다 있다', () => {
    const paths = ROUTES.map((r) => r.path);
    expect(paths).toContain('/api/snapshot');
    // 없으면 화면이 갱신되지 않는다 — P1 완료 조건이 걸려 있다
    expect(paths).toContain('/api/events');
  });
});
