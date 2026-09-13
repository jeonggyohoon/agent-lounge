/**
 * `@lounge/core` — 런타임에 매이지 않는 계층.
 *
 * node 내장 모듈을 쓰지 않는다. 브라우저 번들(뷰어의 웹뷰)에 그대로 들어간다.
 * 파일 접근은 `LoungeIO` 를 주입받아서 한다 — 탐색·파싱·검증 규칙은 여기 있고
 * 파일을 실제로 여는 방법만 바깥에서 온다.
 *
 * node 어댑터가 필요하면 `@lounge/core/fs` 를 쓴다.
 */
export * from './types.js';
export * from './tokens.js';
export * from './config.js';
export * from './frontmatter.js';
export * from './rules.js';
export * from './paths.js';
export * from './io.js';
export * from './sha.js';
export * from './discover.js';
export * from './store.js';
