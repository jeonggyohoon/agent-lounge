/**
 * YAML frontmatter 분리기.
 *
 * entries/*.md 는 `---` 펜스로 감싼 YAML 머리말과 마크다운 본문으로 이루어진다.
 * 앱과 MCP가 같은 파일을 읽으므로 파싱 규칙도 core 에 한 벌만 둔다.
 */
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

/** 펜스를 분리한 결과. `data` 는 아직 검증되지 않은 날것이다. */
export interface FrontmatterDoc {
  data: unknown;
  body: string;
}

export class FrontmatterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FrontmatterError';
  }
}

/** 여는 펜스 → YAML → 닫는 펜스 → 본문. CRLF 와 BOM 을 허용한다. */
const FENCE_RE = /^﻿?---\r?\n([\s\S]*?)\r?\n?---[ \t]*(?:\r?\n([\s\S]*))?$/;

/**
 * frontmatter 를 분리한다.
 * 펜스가 없으면 본문만 있는 것으로 넘기지 않고 거부한다 — 계약을 벗어난 파일은
 * 조용히 통과시키는 쪽이 더 위험하다.
 */
export function parseFrontmatter(text: string): FrontmatterDoc {
  const match = FENCE_RE.exec(text);
  if (!match) {
    throw new FrontmatterError('--- 로 여닫는 frontmatter 가 없습니다');
  }
  const [, yaml, body] = match;
  let data: unknown;
  try {
    data = parseYaml(yaml ?? '') ?? {};
  } catch (cause) {
    throw new FrontmatterError(`frontmatter YAML 파싱 실패: ${(cause as Error).message}`);
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new FrontmatterError('frontmatter 는 키-값 매핑이어야 합니다');
  }
  // 줄바꿈을 LF 로 맞추고 양끝을 다듬어 stringifyFrontmatter 와 정확히 왕복시킨다
  return { data, body: (body ?? '').replace(/\r\n/g, '\n').trim() };
}

/**
 * frontmatter 를 붙여 파일 내용을 만든다.
 * 줄바꿈은 LF 로 고정한다. Windows 에서 쓴 파일을 macOS 가 읽어도 sha 가 같아야 한다.
 */
export function stringifyFrontmatter(data: unknown, body: string): string {
  const yaml = stringifyYaml(data, { lineWidth: 0 }).replace(/\r\n/g, '\n').trimEnd();
  const trimmed = body.replace(/\r\n/g, '\n').trim();
  return `---\n${yaml}\n---\n\n${trimmed}\n`;
}
