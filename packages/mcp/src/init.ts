/**
 * `--init` — 새 프로젝트에 라운지를 놓는다.
 *
 * 탐색 중에는 절대 만들지 않는다. 오타 난 경로에서 빈 라운지가 생기면 다른
 * 클라이언트와 갈라진 채 각자 잘 도는 것처럼 보인다. 만드는 길은 **사용자가
 * 명시적으로 부르는 이 한 번**뿐이다.
 *
 * 자기가 만든 파일만 건드린다. `.gitignore` 나 `CLAUDE.md` 처럼 프로젝트가
 * 소유한 파일은 고치지 않고 붙여넣을 조각을 출력만 한다 — 남의 파일을
 * 말없이 고치는 도구는 다음에 쓰기가 무섭다.
 */
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { basenamePath, joinPath, PATHS } from '@lounge/core';
import { nodeIO } from '@lounge/core/fs';
import { configJson, LOUNGE_GITIGNORE, loungeMd } from './template.js';

export interface InitResult {
  loungeDir: string;
  created: string[];
  /** 이미 있어서 아무것도 하지 않았는가. */
  existed: boolean;
}

const SUBDIRECTORIES = ['entries', 'acks', 'archive', 'sessions', 'watermarks', 'resume'];

/**
 * `projectDir` 에 `.lounge/` 를 만든다.
 * 이미 있으면 **덮어쓰지 않고** 그 사실만 알린다.
 */
export async function init(projectDir: string, project?: string): Promise<InitResult> {
  const loungeDir = joinPath(projectDir, PATHS.root);
  const name = project ?? basenamePath(projectDir) ?? 'lounge';

  if (await nodeIO.isDirectory(loungeDir)) {
    return { loungeDir, created: [], existed: true };
  }

  await mkdir(loungeDir, { recursive: true });
  for (const sub of SUBDIRECTORIES) {
    await mkdir(joinPath(loungeDir, sub), { recursive: true });
  }

  const files: [string, string][] = [
    [PATHS.config, configJson(name)],
    ['LOUNGE.md', loungeMd(name)],
    ['.gitignore', LOUNGE_GITIGNORE],
  ];
  for (const [relative, body] of files) {
    await writeFile(joinPath(loungeDir, relative), body, 'utf8');
  }

  return { loungeDir, created: files.map(([relative]) => relative), existed: false };
}

/** 다음에 할 일. 프로젝트 파일을 고치는 대신 그대로 출력한다. */
export function nextSteps(loungeDir: string, actor: string): string {
  const projectDir = loungeDir.slice(0, loungeDir.lastIndexOf(PATHS.root) - 1);
  return [
    '',
    '다음은 손으로 합니다. 프로젝트가 소유한 파일은 건드리지 않았습니다.',
    '',
    '1) MCP 등록 — 프로젝트 루트에 .mcp.json',
    '',
    JSON.stringify(
      {
        mcpServers: {
          lounge: {
            command: 'node',
            args: ['<lounge 저장소>/packages/mcp/dist/index.js', '--actor', actor, '--cwd', projectDir],
          },
        },
      },
      null,
      2,
    ),
    '',
    '2) 진입 규칙 — CLAUDE.md 와 AGENTS.md 에 아래를 덧붙입니다',
    '',
    '   이 프로젝트는 여러 AI 클라이언트가 동시에 작업합니다.',
    '   세션을 시작하면 가장 먼저 lounge_join 을 호출하고,',
    '   끝낼 때 lounge_leave 로 다음 세션에 넘길 메모를 남깁니다.',
    '   라운지 파일을 손으로 만들거나 고치지 않습니다. 도구만 씁니다.',
    '',
    '   templates/CLAUDE.md 와 templates/AGENTS.md 를 그대로 써도 됩니다.',
    '',
    '3) git — 커밋할 것과 아닌 것은 .lounge/.gitignore 가 이미 가릅니다.',
    '   .lounge/entries 와 acks 는 프로젝트 지식이므로 커밋합니다.',
    '',
  ].join('\n');
}

/** 라운지가 있지만 비어 있는지. 뷰어의 "아직 오간 내용이 없습니다" 와 같은 판정. */
export async function isEmpty(loungeDir: string): Promise<boolean> {
  try {
    return (await readdir(joinPath(loungeDir, 'entries'))).length === 0;
  } catch {
    return true;
  }
}
