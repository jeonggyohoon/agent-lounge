import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // stdio 서버를 띄우는 검사가 있어 파일을 나란히 돌리지 않는다
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
