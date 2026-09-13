/**
 * 규약 문장이 core 의 원본과 맞는지 본다.
 *
 * 두 문서를 서로 비교하지 않는다. 서로 비교하면 어긋난 것은 알아도 어느 쪽이
 * 맞는지는 모른다. `rules.ts` 가 기준이고 문서가 거기 맞는지만 본다.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SHARED_RULES, containsRule, normalizeProse } from '../src/rules.js';
import { discoverLounge } from '../src/store.js';

const lounge = await discoverLounge(resolve(import.meta.dirname, '..'));

/** 규약 문장을 그대로 실어야 하는 문서. 프로젝트 루트 기준. */
const RULE_DOCS = ['.lounge/LOUNGE.md', 'skills/lounge/SKILL.md'] as const;

/** 문서가 지금 뭐라고 적어 놨는지 끄집어낸다. 실패 메시지에서 바로 비교하려고. */
function excerpt(documentText: string, rule: string): string {
  const wanted = normalizeProse(rule);
  const flat = normalizeProse(documentText);
  const at = flat.indexOf(wanted.slice(0, 24));
  if (at === -1) return '(문장을 찾지 못했습니다. 통째로 빠진 것 같습니다)';
  return flat.slice(at, at + wanted.length + 30);
}

describe('규약 문장의 원본은 packages/core 다', () => {
  for (const [name, rule] of Object.entries(SHARED_RULES)) {
    for (const doc of RULE_DOCS) {
      it(`${doc} 가 ${name} 규칙을 그대로 담는다`, async () => {
        const text = await readFile(resolve(lounge.projectRoot, doc), 'utf8');
        const message = [
          ``,
          `${doc} 가 core 의 ${name} 규칙과 어긋납니다.`,
          ``,
          `  원본 (packages/core/src/rules.ts)`,
          `    ${normalizeProse(rule)}`,
          ``,
          `  ${doc}`,
          `    ${excerpt(text, rule)}`,
          ``,
          `문장을 바꾸려면 rules.ts 를 먼저 고치고 두 문서를 따라 맞춥니다.`,
        ].join('\n');
        expect(containsRule(text, rule), message).toBe(true);
      });
    }
  }

  it('줄바꿈 위치가 달라도 통과한다', () => {
    const wrapped = SHARED_RULES.about.replace('담는다.', '담는다.\n');
    expect(containsRule(`앞 문단\n\n${wrapped}\n\n뒤 문단`, SHARED_RULES.about)).toBe(true);
  });

  it('한 글자라도 다르면 걸린다', () => {
    const tampered = SHARED_RULES.about.replace('영향이 가는지를', '영향이 가는지도');
    expect(containsRule(tampered, SHARED_RULES.about)).toBe(false);
  });
});
