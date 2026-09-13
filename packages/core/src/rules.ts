/**
 * 문서에 글자 그대로 실리는 규약 문장.
 *
 * `.lounge/LOUNGE.md` 와 `skills/lounge/SKILL.md` 는 같은 문장을 각자 싣는다.
 * 한쪽만 고치면 조용히 갈라지는데, 두 문서를 서로 비교하면 어느 쪽이 맞는지
 * 알 수 없다. 그래서 **원본을 여기 한 벌 두고 문서가 여기 맞는지를 본다.**
 *
 * 문장을 고칠 일이 생기면 이 파일을 먼저 고치고 문서를 따라 맞춘다.
 * 반대 방향으로 하면 `test/docs.test.ts` 가 막는다.
 */

/** 줄바꿈 위치와 무관하게 비교하려고 공백을 하나로 누른다. */
export function normalizeProse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** 문서가 규약 문장을 그대로 담고 있는가. 어디서 줄을 바꿨는지는 보지 않는다. */
export function containsRule(documentText: string, rule: string): boolean {
  return normalizeProse(documentText).includes(normalizeProse(rule));
}

/**
 * `about` 에 무엇을 담아야 하는지.
 *
 * 결론만 있고 영향 범위가 없는 요약은 읽는 쪽이 자기 일과 관련 있는지
 * 판단할 수 없어서, 확인하려고 결국 본문을 연다. 그러면 색인층이 무너진다.
 */
export const ABOUT_RULE =
  '**`about` 에는 무엇에 대한 결정인지와 함께, 누구의 어떤 작업에 영향이 가는지를 ' +
  '담는다. 제목을 풀어 쓴 문장은 `about` 이 아니다.**';

/**
 * 두 문서가 함께 실어야 하는 문장들.
 *
 * 문장을 추가하면 검사는 자동으로 늘어난다. 다만 **여기 넣는 것은 두 문서에
 * 똑같이 실려야 하는 문장뿐이다.** 한쪽에만 있어야 할 설명까지 넣으면
 * 문서를 나눈 이유가 사라진다.
 */
export const SHARED_RULES = {
  about: ABOUT_RULE,
} as const;

export type SharedRuleName = keyof typeof SHARED_RULES;
