/**
 * 입장 브리핑.
 *
 * **500토큰이 실질 합격 기준이다.** 브리핑이 길어지면 "매 세션 전체를 훑는
 * 비용"을 "매 세션 브리핑을 읽는 비용"으로 옮긴 것뿐이고, 그러면 라운지를
 * 만든 의미가 없다. 다른 기능이 다 돌아도 이게 넘으면 실패로 친다.
 *
 * 순서는 `skills/lounge/SKILL.md` 가 정한다 —
 * 이어서 할 일, 대기 해제, 경고, 미확인.
 */
import type { Config } from '@lounge/core';
import { isStale, type Reading, type Seen, type Unblocked } from './unread.js';

/** 협상 불가. `docs/PRD.md` 의 성공 기준. */
export const TOKEN_BUDGET = 500;

/** resume 에서 실어 나르는 줄 수의 처음 한도. */
const RESUME_LINES = 6;

/**
 * 토큰 수 어림.
 *
 * 서버에 토크나이저를 넣지 않는다 — 브리핑 한 번 만들자고 수 MB 짜리 표를
 * 메모리에 올릴 이유가 없다. 대신 **넉넉하게 잡는다.** 실제보다 적게 잡으면
 * 상한을 넘겨 놓고 통과했다고 착각하게 된다.
 *
 * `test/checklist.test.ts` 가 실제 토크나이저와 대조해 이 값이 항상
 * 실측치 이상인지 확인한다.
 */
export function estimateTokens(text: string): number {
  let total = 0;
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (code < 128) {
      // 영문 산문은 0.21/자쯤이지만 항목 id 처럼 숫자와 하이픈이 섞이면
      // 0.45/자까지 오른다. 브리핑은 id 가 많으므로 비싼 쪽에 맞춘다.
      total += 0.5;
    } else {
      // 한글 한 글자가 토큰 하나를 넘는 일이 잦다
      total += 1.6;
    }
  }
  return Math.ceil(total);
}

export interface BriefingInput {
  actor: string;
  config: Config;
  reading: Reading;
  unread: Seen[];
  warnings: Seen[];
  unblocked: Unblocked[];
  resume: string | null;
  /** 같은 actor 로 이미 들어와 있는 세션. 경고만 하고 막지 않는다. */
  duplicateSessions: string[];
}

export interface Briefing {
  text: string;
  tokens: number;
  /** 상한 때문에 접은 것이 있는가. */
  trimmed: boolean;
}

function entryLines(seen: Seen): string[] {
  const { entry } = seen;
  const mark = isStale(seen) ? ' [stale]' : '';
  return [`- ${entry.id} ${entry.area}${mark}`, `  ${entry.title}`, `  ${entry.about}`];
}

/**
 * 한 번 조립한다. `expand` 는 미확인을 몇 건까지 펼칠지,
 * `resumeLines` 는 이어서 할 일을 몇 줄까지 실을지.
 */
function assemble(input: BriefingInput, expand: number, resumeLines: number): string {
  const { config, unread, warnings, unblocked, resume } = input;
  const lines: string[] = [];

  const head = [`${config.project} 라운지`, input.actor];
  head.push(unread.length === 0 ? '미확인 없음' : `미확인 ${unread.length}건`);
  lines.push(head.join(' · '));

  for (const id of input.duplicateSessions) {
    lines.push(`! 같은 actor 의 세션이 이미 있습니다 (${id})`);
  }

  if (resume && resumeLines > 0) {
    const body = resume.trim().split('\n').filter(Boolean);
    lines.push('', '# 이어서 할 일');
    lines.push(...body.slice(0, resumeLines).map((l) => `  ${l}`));
    if (body.length > resumeLines) lines.push(`  … 외 ${body.length - resumeLines}줄`);
  }

  if (unblocked.length > 0) {
    lines.push('', '# 진행 가능');
    for (const { blocked, waitedOn } of unblocked) {
      const reason = waitedOn ? `${waitedOn.id} 가 풀렸습니다` : '기다리던 항목이 없습니다';
      lines.push(`- ${blocked.id} ${blocked.title} — ${reason}`);
    }
  }

  // 경고는 줄이지 않는다. 반영한 내용이 틀렸다는 뜻이라 접으면 안 된다.
  if (warnings.length > 0) {
    lines.push('', '# 경고');
    for (const { entry } of warnings) {
      lines.push(`- ${entry.id} ${entry.title}`);
      lines.push('  반영했는데 이 항목이 대체됐습니다. 대체 항목을 확인하세요.');
    }
  }

  if (unread.length > 0) {
    lines.push('', `# 미확인 ${unread.length}건`);
    for (const seen of unread.slice(0, expand)) lines.push(...entryLines(seen));
    const folded = unread.length - Math.min(expand, unread.length);
    if (folded > 0) lines.push(`- 외 ${folded}건. lounge_digest 로 봅니다.`);
  }

  return lines.join('\n');
}

/**
 * 상한에 맞을 때까지 줄인다.
 *
 * **`about` 을 자르지 않는다.** 끝이 잘린 요약은 판단 근거가 못 되고, 결국
 * 전부 `lounge_open` 을 부르게 되어 아끼려던 것을 그대로 잃는다.
 * 줄일 때는 건수로 접는다.
 */
export function buildBriefing(input: BriefingInput): Briefing {
  const maxUnread = Math.min(input.config.briefing.maxUnread, input.unread.length);

  for (let expand = maxUnread; expand >= 0; expand -= 1) {
    for (const resumeLines of [RESUME_LINES, 3, 1, 0]) {
      const text = assemble(input, expand, resumeLines);
      const tokens = estimateTokens(text);
      if (tokens <= TOKEN_BUDGET) {
        return {
          text,
          tokens,
          trimmed: expand < maxUnread || resumeLines < RESUME_LINES,
        };
      }
    }
  }

  // 여기까지 왔다면 머리글과 경고만으로 상한을 넘긴 것이다.
  // 경고는 접지 않기로 했으므로 넘긴 채로 내보내고 사실대로 알린다.
  const text = assemble(input, 0, 0);
  return { text, tokens: estimateTokens(text), trimmed: true };
}
