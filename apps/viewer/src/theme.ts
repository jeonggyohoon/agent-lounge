/**
 * 토큰을 CSS 변수로 주입한다.
 *
 * **색·간격·타이포 값이 이 파일에도 없다.** 전부 `tokens.ts` 에서 나온다.
 * 새 상태나 새 색이 생기면 `packages/core/src/tokens.ts` 한 곳만 고친다.
 */
import { cssVariables } from '@lounge/core';

const STYLE_ID = 'lounge-tokens';

/**
 * light 를 `:root` 에 깔고 dark 를 미디어 쿼리로 덮는다.
 * `cssVariables()` 가 `:root { ... }` 를 통째로 내놓으므로 감싸기만 하면 된다.
 */
export function tokenStylesheet(): string {
  return [
    cssVariables('light'),
    `@media (prefers-color-scheme: dark) {`,
    cssVariables('dark'),
    `}`,
  ].join('\n');
}

export function installTokens(doc: Document = document): void {
  const existing = doc.getElementById(STYLE_ID);
  const style = existing ?? doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = tokenStylesheet();
  if (!existing) doc.head.appendChild(style);
}
