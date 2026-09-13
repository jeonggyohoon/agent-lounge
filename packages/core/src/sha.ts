/**
 * ref 파일의 지문.
 *
 * 계약(docs/DATA-CONTRACT.md): git 이 있으면 `git hash-object`, 없으면 SHA-256.
 * 둘 다 앞 8자만 쓴다.
 *
 * `git hash-object` 는 sha1("blob <바이트수>\0" + 내용) 이므로 같은 값을 직접
 * 계산한다. 결과는 git 이 내놓는 것과 한 글자도 다르지 않으면서, ref 하나마다
 * 자식 프로세스를 띄우지 않는다. stale 은 읽을 때마다 계산되므로 이 차이가 크다.
 *
 * 해시 자체는 런타임이 한다 — node 는 `node:crypto`, 웹뷰는 WebCrypto.
 */
import type { LoungeIO } from './io.js';
import { dirnamePath, joinPath } from './paths.js';

const SHA_LENGTH = 8;

/** `blob <len>\0` 앞머리를 붙인 바이트. git 의 blob 해시 입력이다. */
export function gitBlobInput(content: Uint8Array): Uint8Array {
  const header = new TextEncoder().encode(`blob ${content.length}\0`);
  const out = new Uint8Array(header.length + content.length);
  out.set(header, 0);
  out.set(content, header.length);
  return out;
}

/** 위로 올라가며 `.git` 을 찾는다. worktree 는 `.git` 이 파일이라 종류를 보지 않는다. */
export async function isGitRepo(io: LoungeIO, startDir: string): Promise<boolean> {
  let current = startDir;
  for (;;) {
    if (await io.exists(joinPath(current, '.git'))) return true;
    const parent = dirnamePath(current);
    if (parent === current) return false;
    current = parent;
  }
}

/**
 * `projectRoot` 기준 상대 경로 `refPath` 의 지문 앞 8자.
 * 파일이 없으면 `null` — 삭제된 ref 도 stale 의 한 형태다.
 */
export async function refSha(
  io: LoungeIO,
  projectRoot: string,
  refPath: string,
): Promise<string | null> {
  const content = await io.readBytes(joinPath(projectRoot, refPath));
  if (content === null) return null;
  const digest = (await isGitRepo(io, projectRoot))
    ? await io.sha1(gitBlobInput(content))
    : await io.sha256(content);
  return digest.slice(0, SHA_LENGTH);
}
