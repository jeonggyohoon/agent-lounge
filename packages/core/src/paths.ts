/**
 * 경로 조작.
 *
 * `node:path` 를 쓰지 않는다. 이 함수들은 웹뷰에서도 돌아야 하고, 다루는 것은
 * 이미 절대 경로인 라운지 폴더와 `PATHS` 가 만든 상대 조각뿐이다.
 * 구분자는 `/` 와 `\` 를 모두 받아들이고, 내놓을 때는 받은 쪽을 유지한다.
 */

const SEPARATOR = /[\\/]/;

/** Windows 드라이브 문자(`D:`)나 UNC 앞머리를 알아본다. */
function rootLengthOf(path: string): number {
  if (/^[a-zA-Z]:[\\/]/.test(path)) return 3;
  if (/^[\\/]{2}/.test(path)) return 2;
  if (SEPARATOR.test(path.charAt(0))) return 1;
  return 0;
}

function separatorOf(path: string): string {
  return path.includes('\\') && !path.includes('/') ? '\\' : '/';
}

/**
 * 절대 경로에 상대 조각을 잇는다. `.` 과 `..` 을 접는다.
 * 조각이 절대 경로면 그것으로 갈아탄다.
 */
export function joinPath(base: string, ...parts: string[]): string {
  let current = base;
  for (const part of parts) {
    if (!part) continue;
    current = rootLengthOf(part) > 0 ? part : `${current}${separatorOf(current)}${part}`;
  }
  return normalizePath(current);
}

/** `.` 과 `..` 을 접고 중복 구분자를 정리한다. 루트 위로는 올라가지 않는다. */
export function normalizePath(path: string): string {
  const sep = separatorOf(path);
  const rootLength = rootLengthOf(path);
  const root = path.slice(0, rootLength);
  const rest = path.slice(rootLength);

  const stack: string[] = [];
  for (const segment of rest.split(SEPARATOR)) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (stack.length > 0 && stack[stack.length - 1] !== '..') stack.pop();
      else if (rootLength === 0) stack.push('..');
      continue;
    }
    stack.push(segment);
  }
  const joined = stack.join(sep);
  if (root) return `${root.replace(/[\\/]+$/, sep === '\\' ? '\\' : '/')}${joined}`;
  return joined || '.';
}

/** 한 단계 위. 루트에 닿으면 자기 자신을 돌려준다 — 위로 올라가기의 정지 조건. */
export function dirnamePath(path: string): string {
  const normalized = normalizePath(path);
  const rootLength = rootLengthOf(normalized);
  const rest = normalized.slice(rootLength);
  const cut = Math.max(rest.lastIndexOf('/'), rest.lastIndexOf('\\'));
  if (cut <= 0) return rootLength > 0 ? normalized.slice(0, rootLength) : normalized;
  return normalized.slice(0, rootLength + cut);
}

/** 마지막 조각. 라운지 폴더 이름이나 프로젝트 폴더 이름을 뽑을 때 쓴다. */
export function basenamePath(path: string): string {
  const normalized = normalizePath(path).replace(/[\\/]+$/, '');
  const parts = normalized.split(SEPARATOR);
  return parts[parts.length - 1] ?? '';
}
