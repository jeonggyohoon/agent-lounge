/**
 * 프로젝트 폴더에서 뷰어를 띄운다.
 *
 * ```
 * cd ~/work/myapp
 * node ~/tools/lounge/apps/viewer/dist/cli.js
 * ```
 *
 * **라운지를 못 찾으면 만들지 않고 종료한다.** MCP 서버와 같은 규칙이고 같은
 * 종료 코드를 쓴다 — 조용히 만들면 오타 난 경로에서 빈 라운지가 생기고,
 * 다른 클라이언트와 갈라진 채 각자 잘 도는 것처럼 보인다.
 */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  LoungeNotFoundError,
  basenamePath,
  findLoungeWith,
  openReadonlyLounge,
  projectRootOf,
} from '@lounge/core';
import { nodeIO } from '@lounge/core/fs';
import { createViewerServer } from './index.js';
import { openBrowser } from './open.js';
import { listenOnFreePort, listenOnPort, PortError } from './port.js';
import { closeAllChanges } from './watch.js';

const HOST = '127.0.0.1';

/** 라운지를 못 찾았을 때. MCP 서버의 같은 상황과 코드를 맞춘다. */
const EXIT_NO_LOUNGE = 3;

/** `--port` 로 지정한 자리가 막혀 있을 때. */
const EXIT_PORT_BUSY = 4;

export interface CliOptions {
  cwd: string;
  open: boolean;
  port: number | null;
}

export function parseArgv(argv: string[], cwd = process.cwd()): CliOptions {
  const valueOf = (flag: string) => {
    const at = argv.indexOf(flag);
    return at !== -1 ? argv[at + 1] : undefined;
  };
  const port = valueOf('--port');
  return {
    cwd: resolve(valueOf('--cwd') ?? cwd),
    open: !argv.includes('--no-open'),
    port: port ? Number(port) : null,
  };
}

export function noLoungeMessage(cwd: string): string {
  return [
    `${cwd} 및 상위 경로에서 .lounge/ 를 찾지 못했습니다.`,
    '',
    '뷰어는 라운지를 만들지 않습니다. 먼저 놓으세요.',
    '',
    `  node <lounge 저장소>/packages/mcp/dist/index.js --init --cwd "${cwd}"`,
    '',
  ].join('\n');
}

/** 빌드된 프런트엔드. 없으면 백엔드만 뜨고 화면은 안 나온다. */
function webRoot(): string | undefined {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [resolve(here, 'web'), resolve(here, '../dist/web')]) {
    if (existsSync(resolve(candidate, 'index.html'))) return candidate;
  }
  return undefined;
}

export async function run(argv: string[] = process.argv.slice(2)): Promise<void> {
  const options = parseArgv(argv);

  let loungeDir: string;
  try {
    // MCP 와 같은 함수, 같은 규칙. 여기가 갈리면 같은 폴더를 둘이 다르게 본다.
    loungeDir = await findLoungeWith(nodeIO, options.cwd);
  } catch (error) {
    if (error instanceof LoungeNotFoundError) {
      process.stderr.write(noLoungeMessage(options.cwd));
      process.exit(EXIT_NO_LOUNGE);
    }
    throw error;
  }

  const projectRoot = projectRootOf(loungeDir);

  // 화면에 뜨는 이름과 같은 것을 찍는다. 터미널과 창이 다른 이름을 말하면
  // 여러 개를 띄웠을 때 어느 창이 어느 프로젝트인지 헷갈린다.
  const lounge = openReadonlyLounge(nodeIO, loungeDir);
  const name = (await lounge.readConfig()).project || basenamePath(projectRoot);

  const staticDir = webRoot();
  const server = createViewerServer({
    defaultProject: projectRoot,
    ...(staticDir ? { staticDir } : {}),
  });

  let port: number;
  try {
    // 지정했으면 그 자리로만 연다. 안 했으면 빈 자리를 찾는다.
    port = options.port
      ? await listenOnPort(server, HOST, options.port)
      : await listenOnFreePort(server, HOST);
  } catch (error) {
    if (error instanceof PortError) {
      process.stderr.write(`${error.message}
`);
      process.exit(EXIT_PORT_BUSY);
    }
    throw error;
  }
  const url = `http://${HOST}:${port}`;

  process.stdout.write(
    [
      `라운지   ${loungeDir}`,
      `프로젝트 ${name}`,
      `열림     ${url}`,
      staticDir ? '' : '경고: 빌드된 화면이 없습니다. pnpm --filter @lounge/viewer build 를 먼저 실행하세요.',
      '',
    ]
      .filter((line) => line !== '')
      .join('\n') + '\n',
  );

  if (options.open && !openBrowser(url)) {
    process.stdout.write('브라우저를 열지 못했습니다. 위 주소를 직접 여세요.\n');
  }

  const shutdown = () => {
    server.close();
    void closeAllChanges().then(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

/**
 * 번들된 파일이 직접 실행됐는가. 테스트가 import 할 때는 돌지 않아야 한다.
 *
 * 경로를 손으로 `file://` 에 이어붙이면 Windows 에서 `file://D:/...` 가 되어
 * 드라이브 문자가 호스트로 먹힌다. `pathToFileURL` 이 그걸 처리한다.
 */
const invoked = process.argv[1];
if (invoked && import.meta.url === pathToFileURL(resolve(invoked)).href) {
  run().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
