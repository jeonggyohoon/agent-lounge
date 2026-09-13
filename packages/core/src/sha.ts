/**
 * ref 파일의 지문.
 *
 * 계약(docs/DATA-CONTRACT.md): git 이 있으면 `git hash-object`, 없으면 SHA-256.
 * 둘 다 앞 8자만 쓴다.
 *
 * `git hash-object` 는 sha1("blob <바이트수>\0" + 내용) 이므로 같은 값을 직접
 * 계산한다. 결과는 git 이 내놓는 것과 한 글자도 다르지 않으면서, ref 하나마다
 * 자식 프로세스를 띄우지 않는다. stale 은 읽을 때마다 계산되므로 이 차이가 크다.
 */
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const SHA_LENGTH = 8;

/** git 의 blob 해시 (= `git hash-object <file>`) */
export function gitBlobSha(content: Buffer): string {
  return createHash('sha1')
    .update(`blob ${content.length}\0`)
    .update(content)
    .digest('hex');
}

export function sha256(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** 위로 올라가며 `.git` 을 찾는다. worktree 는 `.git` 이 파일이므로 종류를 안 본다. */
export async function isGitRepo(startDir: string): Promise<boolean> {
  let current = resolve(startDir);
  for (;;) {
    if (await exists(resolve(current, '.git'))) return true;
    const parent = dirname(current);
    if (parent === current) return false;
    current = parent;
  }
}

/**
 * `projectRoot` 기준 상대 경로 `refPath` 의 sha 앞 8자.
 * 파일이 없으면 `null` — 삭제된 ref 도 stale 의 한 형태다.
 */
export async function refSha(projectRoot: string, refPath: string): Promise<string | null> {
  const absolute = resolve(projectRoot, refPath);
  let content: Buffer;
  try {
    content = await readFile(absolute);
  } catch {
    return null;
  }
  const digest = (await isGitRepo(projectRoot)) ? gitBlobSha(content) : sha256(content);
  return digest.slice(0, SHA_LENGTH);
}
