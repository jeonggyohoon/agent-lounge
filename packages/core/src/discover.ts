/**
 * 라운지 탐색.
 *
 * 경로 문자열을 라운지 신원으로 쓰지 않는다. 대소문자, 하위 폴더 실행,
 * 네트워크 드라이브 매핑 때문에 같은 폴더가 다른 라운지로 갈린다.
 * git 과 같은 방식으로 위로 올라가며 찾고 realpath 로 정규화한다.
 */
import { realpath, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { PATHS } from './types.js';

export class LoungeNotFoundError extends Error {
  /** 탐색을 시작한 디렉터리 (정규화된 절대 경로) */
  readonly from: string;

  constructor(from: string) {
    super(`${from} 및 상위 경로에서 ${PATHS.root}/ 를 찾지 못했습니다`);
    this.name = 'LoungeNotFoundError';
    this.from = from;
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * `startDir` 에서 위로 올라가며 처음 만나는 `.lounge/` 의 절대 경로를 돌려준다.
 *
 * 못 찾으면 **실패한다.** 조용히 새로 만들지 않는다 — 오타 난 경로에서 빈
 * 라운지가 생기면 다른 클라이언트와 갈라진 채로 각자 잘 도는 것처럼 보인다.
 */
export async function findLounge(startDir: string = process.cwd()): Promise<string> {
  let current: string;
  try {
    current = await realpath(resolve(startDir));
  } catch {
    // 아직 존재하지 않는 경로여도 탐색 자체는 시도한다
    current = resolve(startDir);
  }
  const from = current;

  for (;;) {
    const candidate = resolve(current, PATHS.root);
    if (await isDirectory(candidate)) {
      return realpath(candidate);
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new LoungeNotFoundError(from);
}

/** 찾지 못하면 던지는 대신 `null`. 뷰어의 "라운지 없음" 빈 화면용. */
export async function tryFindLounge(startDir: string = process.cwd()): Promise<string | null> {
  try {
    return await findLounge(startDir);
  } catch (error) {
    if (error instanceof LoungeNotFoundError) return null;
    throw error;
  }
}

/** 라운지 폴더의 부모 = 프로젝트 루트. ref 경로의 기준점이다. */
export function projectRootOf(loungeDir: string): string {
  return dirname(loungeDir);
}
