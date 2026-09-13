/**
 * 뷰어 백엔드.
 *
 * 하는 일은 셋뿐이다 — 라운지를 읽어 JSON 으로 내주고, `.lounge/` 를 감시해
 * SSE 로 알리고, 빌드된 프런트엔드를 정적으로 준다.
 *
 * **쓰기 엔드포인트가 없다.** GET 외의 메서드는 라우트를 찾기도 전에 405 로
 * 끊는다. 파일을 바꾸는 코드도 없다 — `ReadonlyLounge` 만 만든다.
 *
 * **루프백에만 붙는다.** 다른 기계에서 이 서버로 로컬 파일을 읽어 갈 수 없다.
 *
 * **이 파일은 최상위에서 아무것도 하지 않는다.** 여기에 자체 실행 블록을 두면
 * cli 번들에 섞여 들어가 진입점 판별이 같이 참이 되고, 포트를 두 번 잡는다.
 * 실제로 그렇게 깨졌다. 띄우는 일은 serve.ts 와 cli.ts 가 한다.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { findRoute } from './routes.js';

export const HOST = '127.0.0.1';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

export interface ServerOptions {
  defaultProject: string;
  port?: number;
  /** 빌드된 프런트엔드 폴더. 없으면 정적 서빙을 하지 않는다 (vite dev 가 맡는다). */
  staticDir?: string;
}

export function createViewerServer(options: ServerOptions) {
  const { defaultProject, staticDir } = options;

  return createServer((request, response) => {
    void handle(request, response, defaultProject, staticDir);
  });
}

async function handle(
  request: IncomingMessage,
  response: ServerResponse,
  defaultProject: string,
  staticDir: string | undefined,
): Promise<void> {
  // 읽기 말고는 아무것도 받지 않는다. 라우트를 보기도 전에 끊는다.
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { allow: 'GET, HEAD', 'content-type': 'text/plain; charset=utf-8' });
    response.end('이 서버는 읽기만 합니다');
    return;
  }

  const url = new URL(request.url ?? '/', `http://${HOST}`);
  const route = findRoute('GET', url.pathname);

  if (route) {
    try {
      await route.handle(request, response, { url, defaultProject });
    } catch (error) {
      if (!response.headersSent) {
        response.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      }
      response.end(JSON.stringify({ error: 'failed', message: (error as Error).message }));
    }
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: 'not-found' }));
    return;
  }

  if (staticDir) {
    serveStatic(url.pathname, staticDir, response);
    return;
  }

  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  response.end('없습니다');
}

function serveStatic(pathname: string, staticDir: string, response: ServerResponse): void {
  // `..` 으로 정적 폴더 밖을 읽는 길을 막는다
  const wanted = normalize(join(staticDir, pathname === '/' ? 'index.html' : pathname));
  const inside = wanted.startsWith(normalize(staticDir));
  const file = inside && existsSync(wanted) && statSync(wanted).isFile()
    ? wanted
    : join(staticDir, 'index.html');

  if (!existsSync(file)) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('빌드된 화면이 없습니다. pnpm build 를 먼저 실행하세요.');
    return;
  }

  response.writeHead(200, {
    'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    'x-content-type-options': 'nosniff',
  });
  createReadStream(file).pipe(response);
}

