/**
 * MCP 서버 배선.
 *
 * 도구의 실제 동작은 `tools.ts` 에 있다. 여기는 스키마를 붙이고 결과를
 * 텍스트로 옮기는 일만 한다 — **출력이 길면 그 자체가 비용이므로**
 * 어느 도구도 항목 본문을 요청 없이 흘리지 않는다.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ACTOR_RE, ENTRY_ID_RE, LIMITS } from '@lounge/core';
import {
  ToolError,
  ack,
  digest,
  join,
  leave,
  open,
  post,
  type Context,
  type DigestRow,
} from './tools.js';

type ToolReply = {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
};

function text(body: string): ToolReply {
  return { content: [{ type: 'text', text: body }] };
}

/** 도구가 거부한 이유는 모델이 고칠 수 있게 그대로 돌려준다. */
async function guard(run: () => Promise<ToolReply>): Promise<ToolReply> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ToolError) {
      return { content: [{ type: 'text', text: `거부됨: ${error.message}` }], isError: true };
    }
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: 'text', text: `실패: ${message}` }], isError: true };
  }
}

function rows(label: string, list: DigestRow[]): string[] {
  if (list.length === 0) return [];
  return [
    `# ${label} ${list.length}건`,
    ...list.flatMap((r) => [
      `- ${r.id} ${r.area}${r.stale ? ' [stale]' : ''}`,
      `  ${r.title}`,
      `  ${r.about}`,
    ]),
  ];
}

export function createServer(context: Context): McpServer {
  const server = new McpServer({ name: 'lounge', version: '0.1.0' });

  server.registerTool(
    'lounge_join',
    {
      title: '라운지 입장',
      description:
        '세션을 시작하고 브리핑을 받습니다. 세션에서 가장 먼저 호출합니다. ' +
        '미확인 항목은 요약 한 줄만 읽고, 내 작업과 관련 있는 것만 lounge_open 으로 엽니다.',
      inputSchema: {},
    },
    () =>
      guard(async () => {
        const result = await join(context);
        const notes = result.swept.flatMap((s) =>
          s.entryId ? [`정리됨: ${s.session.actor} 가 메모 없이 끊겨 ${s.entryId} 를 남겼습니다.`] : [],
        );
        return text([result.text, ...notes].join('\n'));
      }),
  );

  server.registerTool(
    'lounge_post',
    {
      title: '항목 남기기',
      description:
        '다른 에이전트의 행동을 바꿀 때만 씁니다. 확정된 스펙, 뒤집힌 결정, 발견한 제약, ' +
        '넘기는 산출물. 진행 보고와 감상과 작업 로그는 lounge_leave 의 메모로 남깁니다.',
      inputSchema: {
        area: z.string().min(1).describe('자유 경로 문자열. 폴더가 아니라 라벨입니다 (예: api/auth)'),
        title: z.string().min(1).max(LIMITS.titleMaxLength).describe('60자 이내'),
        about: z
          .string()
          .min(1)
          .max(LIMITS.aboutMaxLength)
          .describe(
            '120자 이내. 무엇에 대한 결정인지와 누구의 어떤 작업에 영향이 가는지를 담습니다. ' +
              '제목을 풀어 쓴 문장은 about 이 아닙니다. 넘으면 잘리지 않고 거부됩니다',
          ),
        body: z.string().describe('본문 마크다운'),
        to: z.array(z.string().regex(ACTOR_RE)).optional().describe('지목할 actor. 비우면 전체 공지'),
        refs: z.array(z.string()).optional().describe('근거가 된 파일. 프로젝트 루트 기준 상대 경로'),
        supersedes: z.string().regex(ENTRY_ID_RE).nullish().describe('뒤집는 항목 id'),
        reply_to: z.string().regex(ENTRY_ID_RE).nullish().describe('이어 쓰는 항목 id'),
      },
    },
    (input) =>
      guard(async () => {
        const { id } = await post(context, input);
        return text(`남겼습니다: ${id}`);
      }),
  );

  server.registerTool(
    'lounge_open',
    {
      title: '항목 열기',
      description:
        '본문을 읽습니다. 요약만 보고 관련 있다고 판단했을 때만 부릅니다. ' +
        '여는 것만으로는 처리가 아니라서 다음 브리핑에도 미확인으로 남습니다.',
      inputSchema: { id: z.string().regex(ENTRY_ID_RE) },
    },
    ({ id }) =>
      guard(async () => {
        const found = await open(context, id);
        const head = [
          `${found.id} ${found.area} · ${found.by} · ${found.at} · ${found.state}`,
          found.title,
          found.about,
        ];
        if (found.staleRefs.length > 0) {
          head.push(
            `[stale] 작성 이후 바뀐 파일: ${found.staleRefs.join(', ')} — 라운지가 아니라 코드를 믿습니다.`,
          );
        }
        return text([...head, '', found.body].join('\n'));
      }),
  );

  server.registerTool(
    'lounge_ack',
    {
      title: '항목에 답하기',
      description:
        'applied 는 읽고 반영함, skipped 는 내 영역이 아님, blocked 는 관련 있으나 지금 불가. ' +
        'skipped 가 가장 많이 아끼는 값입니다 — 넘기는 것도 처리입니다.',
      inputSchema: {
        entry: z.string().regex(ENTRY_ID_RE),
        state: z.enum(['applied', 'skipped', 'blocked']),
        note: z.string().optional().describe('applied 면 무엇을 했는지'),
        waiting_on: z
          .string()
          .regex(ENTRY_ID_RE)
          .nullish()
          .describe('blocked 에 필수. 이것이 풀리면 다음 브리핑에 진행 가능으로 뜹니다'),
        evidence: z
          .object({ commit: z.string().optional(), files: z.array(z.string()).optional() })
          .optional(),
      },
    },
    (input) =>
      guard(async () => {
        const saved = await ack(context, input);
        return text(`${saved.entry} → ${saved.state}`);
      }),
  );

  server.registerTool(
    'lounge_leave',
    {
      title: '라운지 나가기',
      description:
        '다음 세션의 자신이 읽을 메모를 남기고 자리를 반납합니다. ' +
        '넘길 결정이 있으면 lounge_post 를 먼저 하고 부릅니다.',
      inputSchema: {
        resume: z.string().optional().describe('지금 어디까지 했고 다음에 무엇을 할지'),
      },
    },
    ({ resume }) =>
      guard(async () => {
        const result = await leave(context, resume);
        return text(result.resumeSaved ? '반납했습니다. 메모를 남겼습니다.' : '반납했습니다.');
      }),
  );

  server.registerTool(
    'lounge_digest',
    {
      title: '지금 상태 보기',
      description:
        '세션 도중 미확인과 경고를 다시 셉니다. 라운지는 실시간이 아니라서 ' +
        '상대가 남긴 것은 도구를 부를 때 보입니다.',
      inputSchema: {},
    },
    () =>
      guard(async () => {
        const result = await digest(context);
        const lines = [
          `접속 중: ${result.activeActors.join(', ') || '없음'}`,
          ...rows('경고', result.warnings),
          ...rows('미확인', result.unread),
        ];
        if (result.unread.length === 0 && result.warnings.length === 0) {
          lines.push('미확인 없음');
        }
        return text(lines.join('\n'));
      }),
  );

  return server;
}
