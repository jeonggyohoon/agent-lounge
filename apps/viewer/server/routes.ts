/**
 * 라우트 표.
 *
 * **읽기 전용을 여기서 지킨다.** Tauri 를 쓸 때는 OS 권한 목록에 쓰기가 없는
 * 것이 두 번째 방어선이었다. 로컬 웹앱으로 바꾸면서 그 자리를 이 표가 맡는다.
 *
 * `Route['method']` 가 `'GET'` 리터럴이다. **쓰기 라우트는 타입이 거부한다** —
 * 규율로 참는 것이 아니라 `method: 'POST'` 라고 쓰는 순간 컴파일이 깨진다.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { discoverReadonlyLounge, LoungeNotFoundError } from '@lounge/core';
import { nodeIO } from '@lounge/core/fs';
import { readSnapshot } from '../src/lib/snapshot.js';
import { openChanges } from './watch.js';

/** 이 앱이 낼 수 있는 유일한 메서드. */
export type ReadMethod = 'GET';

export interface RouteContext {
  url: URL;
  /** 서버가 시작될 때 받은 기본 프로젝트 폴더. */
  defaultProject: string;
}

export interface Route {
  method: ReadMethod;
  path: string;
  handle(
    request: IncomingMessage,
    response: ServerResponse,
    context: RouteContext,
  ): Promise<void> | void;
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    // CORS 헤더를 일부러 두지 않는다. 다른 출처의 페이지가 이 서버로
    // 로컬 파일을 읽어 가는 길을 열지 않으려는 것이다.
  });
  response.end(payload);
}

/** `?project=` 가 없으면 서버가 들고 시작한 폴더를 쓴다. */
function projectOf(context: RouteContext): string {
  return context.url.searchParams.get('project') || context.defaultProject;
}

export const ROUTES: Route[] = [
  {
    method: 'GET',
    path: '/api/default',
    handle(_request, response, context) {
      sendJson(response, 200, { project: context.defaultProject });
    },
  },

  {
    method: 'GET',
    path: '/api/snapshot',
    async handle(_request, response, context) {
      const project = projectOf(context);
      try {
        // ReadonlyLounge 다. 쓰기 메서드는 이 객체에 존재하지 않는다.
        const lounge = await discoverReadonlyLounge(nodeIO, project);
        sendJson(response, 200, await readSnapshot(lounge));
      } catch (error) {
        if (error instanceof LoungeNotFoundError) {
          sendJson(response, 404, { error: 'no-lounge', project });
          return;
        }
        sendJson(response, 500, { error: 'unreadable', project, message: (error as Error).message });
      }
    },
  },

  {
    method: 'GET',
    path: '/api/events',
    async handle(request, response, context) {
      const project = projectOf(context);
      let changes;
      try {
        changes = await openChanges(project);
      } catch (error) {
        if (error instanceof LoungeNotFoundError) {
          sendJson(response, 404, { error: 'no-lounge', project });
          return;
        }
        throw error;
      }

      response.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-store',
        connection: 'keep-alive',
        'x-content-type-options': 'nosniff',
      });
      // 연결 직후 한 번 보내 프런트가 첫 스냅숏을 받게 한다
      response.write('event: ready\ndata: {}\n\n');

      const stop = changes.subscribe(() => {
        response.write(`event: changed\ndata: ${JSON.stringify({ at: Date.now() })}\n\n`);
      });
      // 프록시와 브라우저가 조용한 연결을 끊지 않게 한다
      const beat = setInterval(() => response.write(': beat\n\n'), 25_000);

      request.on('close', () => {
        clearInterval(beat);
        stop();
      });
    },
  },
];

export function findRoute(method: string | undefined, pathname: string): Route | null {
  return ROUTES.find((route) => route.method === method && route.path === pathname) ?? null;
}
