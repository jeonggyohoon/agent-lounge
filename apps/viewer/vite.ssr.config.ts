import { defineConfig } from 'vite';

/**
 * CLI 번들.
 *
 * `server/cli.ts` 를 `dist/cli.js` 한 파일로 묶는다. `tsc` 로 뽑으면 server 가
 * `../src/lib/snapshot.js` 를 물고 있어 rootDir 이 패키지 루트가 되고
 * `dist/server/cli.js` 로 떨어진다.
 *
 * **`@lounge/core` 에 alias 를 걸지 않는다.** 걸면 core 가 번들 사본과
 * node_modules 사본 둘로 갈리고, `LoungeNotFoundError` 의 instanceof 가
 * 조용히 거짓이 된다 — 라운지 없음이 "알 수 없는 실패"로 처리된다.
 */
export default defineConfig({
  build: {
    ssr: 'server/cli.ts',
    outDir: 'dist',
    // 화면 번들(dist/web)을 지우지 않는다
    emptyOutDir: false,
    target: 'node20',
    rollupOptions: {
      output: {
        entryFileNames: 'cli.js',
        banner: '#!/usr/bin/env node',
      },
    },
  },
});
