/**
 * `@lounge/core/fs` — node 어댑터.
 *
 * `node:fs` 로 움직이는 `LoungeIO` 와, 그것을 끼운 편의 함수들.
 * **쓰기 함수는 전부 이 진입점 뒤에 있다.** 뷰어는 여기를 import 하지 않는다.
 */
import { findLoungeWith, tryFindLoungeWith } from './discover.js';
import { nodeIO } from './node-io.js';
import { refSha } from './sha.js';
import { Lounge } from './store.js';

export * from './index.js';
export { nodeIO } from './node-io.js';

/** 이미 아는 경로로 연다. 존재 여부는 확인하지 않는다. */
export function openLounge(dir: string): Lounge {
  return new Lounge(nodeIO, dir);
}

/** 위로 올라가며 찾아 연다. 못 찾으면 `LoungeNotFoundError`. */
export async function discoverLounge(startDir: string = process.cwd()): Promise<Lounge> {
  return new Lounge(nodeIO, await findLoungeWith(nodeIO, startDir));
}

/** 위로 올라가며 `.lounge/` 경로만 찾는다. */
export async function findLounge(startDir: string = process.cwd()): Promise<string> {
  return findLoungeWith(nodeIO, startDir);
}

/** 못 찾으면 `null`. */
export async function tryFindLounge(startDir: string = process.cwd()): Promise<string | null> {
  return tryFindLoungeWith(nodeIO, startDir);
}

/** `projectRoot` 기준 상대 경로의 지문 앞 8자. */
export async function refShaOf(projectRoot: string, refPath: string): Promise<string | null> {
  return refSha(nodeIO, projectRoot, refPath);
}
