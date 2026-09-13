/**
 * actor 해석.
 *
 * **자동 추론하지 않는다.** PID는 재시작마다 바뀌고, 브랜치는 중간에 바뀌고,
 * 폴더명은 worktree 공유와 충돌한다. 전부 함정이 있어서 명시 지정만 받는다.
 *
 * 틀린 actor 로 조용히 도는 것이 가장 나쁘다 — 읽음 기록이 엉뚱한 곳에 쌓이고
 * 다음 세션의 미확인이 전부 어긋난다. 그래서 없으면 **시작하지 않는다.**
 */
import { ACTOR_RE } from '@lounge/core';

export class ActorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActorError';
  }
}

export interface Options {
  actor: string;
  /** 표시용 클라이언트 이름. 세션 파일에 남는다. */
  client: string;
  /** 라운지 탐색을 시작할 폴더. Claude Desktop 은 작업 디렉터리가 없다. */
  cwd: string;
}

const USAGE = [
  'actor 를 지정해야 합니다.',
  '',
  '  lounge-mcp --actor <이름>[@<영역>] [--client <이름>] [--cwd <경로>]',
  '',
  '예)  lounge-mcp --actor claude-code@auth',
  '',
  '같은 일의 재시작이면 같은 actor, 다른 일의 병렬이면 다른 actor 를 씁니다.',
].join('\n');

function valueOf(argv: string[], flag: string): string | null {
  const at = argv.indexOf(flag);
  if (at === -1) return null;
  const value = argv[at + 1];
  if (!value || value.startsWith('--')) {
    throw new ActorError(`${flag} 뒤에 값이 없습니다.`);
  }
  return value;
}

/** `--actor` 가 없거나 형식이 어긋나면 던진다. 기본값을 만들어 주지 않는다. */
export function parseOptions(argv: string[], env: NodeJS.ProcessEnv = {}): Options {
  const actor = valueOf(argv, '--actor') ?? env.LOUNGE_ACTOR ?? null;
  if (!actor) throw new ActorError(USAGE);

  if (!ACTOR_RE.test(actor)) {
    throw new ActorError(
      `actor "${actor}" 는 쓸 수 없습니다.\n` +
        '소문자, 숫자, - 만 쓰고 영역은 @ 로 붙입니다 (예: claude-code@auth).\n' +
        'actor 는 파일명에 그대로 들어가므로 @ 외의 특수문자를 받지 않습니다.',
    );
  }

  return {
    actor,
    client: valueOf(argv, '--client') ?? env.LOUNGE_CLIENT ?? actor.split('@')[0]!,
    cwd: valueOf(argv, '--cwd') ?? env.LOUNGE_CWD ?? process.cwd(),
  };
}
