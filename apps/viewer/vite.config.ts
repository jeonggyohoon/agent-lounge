import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const BACKEND_PORT = Number(process.env.LOUNGE_VIEWER_PORT ?? 5174);

/**
 * `pnpm dev` 하나로 백엔드까지 뜨게 한다.
 * 창을 두 개 열어 두 명령을 기억하게 만들지 않는다.
 */
function backend(): Plugin {
  let child: ChildProcess | null = null;

  return {
    name: 'lounge-backend',
    apply: 'serve',
    configureServer(server) {
      const project = process.env.LOUNGE_PROJECT ?? resolve(import.meta.dirname, '../..');
      child = spawn(
        'pnpm',
        ['exec', 'tsx', 'server/serve.ts', '--project', project],
        {
          cwd: import.meta.dirname,
          stdio: 'inherit',
          shell: process.platform === 'win32',
          env: { ...process.env, LOUNGE_VIEWER_PORT: String(BACKEND_PORT) },
        },
      );
      server.httpServer?.on('close', () => child?.kill());
      process.on('exit', () => child?.kill());
    },
  };
}

/**
 * core 는 dist 가 아니라 소스를 직접 문다.
 * 뷰어를 고치려고 core 를 먼저 빌드해야 하는 단계를 없앤다.
 */
export default defineConfig({
  plugins: [react(), backend()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${BACKEND_PORT}`,
        changeOrigin: false,
        // SSE 는 응답을 버퍼링하면 안 된다
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            if (proxyRes.headers['content-type']?.includes('text/event-stream')) {
              proxyRes.headers['cache-control'] = 'no-store';
            }
          });
        },
      },
    },
  },
  resolve: {
    // '@lounge/core' 만 정확히 건다. '@lounge/core/fs' 는 일부러 걸지 않는다 —
    // 프런트엔드가 실수로 node 어댑터를 물면 조용히 되지 말고 빌드가 깨져야 한다.
    alias: [{ find: /^@lounge\/core$/, replacement: resolve(import.meta.dirname, '../../packages/core/src/index.ts') }],
  },
  // dist/ 루트는 CLI 번들 자리다. 화면은 dist/web 아래로 내린다.
  build: { target: 'es2022', outDir: 'dist/web' },
});
