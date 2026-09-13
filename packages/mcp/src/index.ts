#!/usr/bin/env node
/**
 * 라운지 MCP 서버 진입점.
 *
 * ```
 * lounge-mcp --actor claude-code@auth [--client claude-code] [--cwd <경로>]
 * lounge-mcp --init [--cwd <경로>] [--project <이름>]
 * ```
 *
 * **라운지를 못 찾으면 시작하지 않는다.** 조용히 만들면 오타 난 경로에서 빈
 * 라운지가 생기고, 다른 클라이언트와 갈라진 채 각자 잘 도는 것처럼 보인다.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { LoungeNotFoundError } from '@lounge/core';
import { discoverLounge } from '@lounge/core/fs';
import { ActorError, parseOptions } from './actor.js';
import { init, nextSteps } from './init.js';
import { createServer } from './server.js';
import { sessionId } from './session.js';
import type { Context } from './tools.js';

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  if (argv.includes('--init')) return runInit(argv);

  const options = parseOptions(argv, process.env);
  const lounge = await discoverLounge(options.cwd);

  const context: Context = {
    lounge,
    actor: options.actor,
    client: options.client,
    sessionId: sessionId(options.actor),
    cwd: options.cwd,
    now: () => new Date(),
  };

  await createServer(context).connect(new StdioServerTransport());

  // stdout 은 프로토콜 전용이다. 사람이 읽을 것은 전부 stderr 로 보낸다.
  process.stderr.write(
    `라운지 ${lounge.dir}\nactor ${options.actor} · 세션 ${context.sessionId}\n`,
  );
}

/**
 * 라운지를 놓고 끝낸다. 서버로 이어지지 않는다 —
 * 만드는 일과 붙는 일은 다른 행위이고, 섞으면 실수로 만드는 길이 생긴다.
 */
async function runInit(argv: string[]): Promise<void> {
  const at = argv.indexOf('--cwd');
  const projectDir = at !== -1 && argv[at + 1] ? argv[at + 1]! : process.cwd();
  const nameAt = argv.indexOf('--project');
  const project = nameAt !== -1 ? argv[nameAt + 1] : undefined;
  const actorAt = argv.indexOf('--actor');
  const actor = actorAt !== -1 && argv[actorAt + 1] ? argv[actorAt + 1]! : 'claude-code';

  const result = await init(projectDir, project);
  if (result.existed) {
    process.stdout.write(`이미 있습니다: ${result.loungeDir}\n덮어쓰지 않았습니다.\n`);
    return;
  }
  const made = result.created.map((name) => `  ${name}`).join('\n');
  process.stdout.write(
    `만들었습니다: ${result.loungeDir}\n${made}\n${nextSteps(result.loungeDir, actor)}`,
  );
}

/** 이 파일이 직접 실행됐는가. 테스트가 import 할 때는 돌지 않아야 한다. */
function isEntryPoint(): boolean {
  const invoked = process.argv[1];
  if (!invoked) return false;
  const normalized = invoked.replace(/\\/g, '/');
  return import.meta.url.endsWith(normalized.slice(normalized.lastIndexOf('/') + 1));
}

if (isEntryPoint()) {
  main().catch((error: unknown) => {
    if (error instanceof ActorError) {
      process.stderr.write(`${error.message}\n`);
      process.exit(2);
    }
    if (error instanceof LoungeNotFoundError) {
      process.stderr.write(
        `${error.message}\n` +
          '라운지는 여기서 만들지 않습니다. 만들 폴더를 정했다면 .lounge/ 를 두고 다시 실행하세요.\n',
      );
      process.exit(3);
    }
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
