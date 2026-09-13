import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * 테스트는 vite.config.ts 를 쓰지 않는다.
 *
 * 거기에는 dev 에서 백엔드를 띄우는 플러그인이 있고, vitest 도 vite 를 serve
 * 모드로 올리기 때문에 테스트를 돌릴 때마다 백엔드가 딸려 올라와 포트를 문다.
 * 테스트는 자기 서버를 자기가 띄운다.
 */
export default defineConfig({
  resolve: {
    // 접두어 치환이 아니라 정확히 일치시킨다.
    // 문자열 키로 두면 '@lounge/core/fs' 가 'index.ts/fs' 로 바뀐다.
    alias: [
      { find: /^@lounge\/core$/, replacement: resolve(import.meta.dirname, '../../packages/core/src/index.ts') },
      { find: /^@lounge\/core\/fs$/, replacement: resolve(import.meta.dirname, '../../packages/core/src/fs.ts') },
    ],
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // 서버 테스트가 포트를 잡으므로 파일을 나란히 돌리지 않는다
    fileParallelism: false,
  },
});
