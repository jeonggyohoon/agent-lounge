# Lounge — MVP 프로젝트 킷

여러 AI 클라이언트(Claude Code, Codex, Claude Desktop)가 같은 로컬 프로젝트
폴더를 작업할 때, 서로 무엇을 알고 무엇을 했는지 공유하는 조정 계층.

**존재 이유는 소통이 아니라 컨텍스트 절약이다.** 읽었다는 기록이 남으면
"내가 아직 안 본 것"이 계산되고, 세션마다 전체를 다시 훑을 이유가 사라진다.
이 목적에 기여하지 않는 기능은 MVP에서 뺀다.

## 구성

```
lounge/
  docs/
    PRD.md              무엇을 왜 만드는가
    ARCHITECTURE.md     구조와 경계
    DATA-CONTRACT.md    파일 스키마 — 앱과 MCP의 공용 진실
    DESIGN-SYSTEM.md    토큰, 컴포넌트, 재사용 규칙
    ROADMAP.md          단계와 완료 조건
  packages/core/        타입·상태·토큰·검증·파일 입출력. 앱과 MCP가 함께 씀
    src/types.ts        스키마와 경로 규칙 — 문서와 어긋나면 이쪽이 맞다
    src/tokens.ts       색, 간격, 타이포, 상태별 라벨과 tone
    src/frontmatter.ts  entries/*.md 의 머리말 분리
    src/discover.ts     위로 올라가며 .lounge/ 찾기
    src/store.ts        읽기와 쓰기
    src/sha.ts          ref 지문 (stale 판정용)
  .lounge/              이 저장소 자신의 라운지
  skills/lounge/        에이전트가 읽는 사용 규약
  CLAUDE.md             Claude Code 진입 규칙
  AGENTS.md             Codex 진입 규칙
  hooks.json            세션 시작/종료 훅
```

## 읽는 순서

처음이면 `docs/PRD.md` → `docs/ARCHITECTURE.md` → `docs/DATA-CONTRACT.md`.
구현을 시작할 거면 `docs/ROADMAP.md`의 P0부터.

## 시작

```
pnpm install
pnpm test        # core 단위 테스트 + 이 저장소의 .lounge/ 검증
pnpm build
```

`@lounge/core` 는 진입점이 둘이다.

| 진입점 | 내용 |
|---|---|
| `@lounge/core` | 타입, 토큰, 검증, frontmatter. node 내장 모듈을 쓰지 않는다 |
| `@lounge/core/fs` | 탐색, 읽기, 쓰기, ref 지문 |

```ts
import { discoverLounge } from '@lounge/core/fs';

const lounge = await discoverLounge();   // 못 찾으면 던진다. 만들지 않는다
for (const { entry } of await lounge.listEntries()) {
  console.log(entry.about);
}
```

## 절대 규칙

1. **`packages/core`가 단일 진실이다.** 상태 이름, 라벨, 색 이름, 파일 경로
   규칙을 앱이나 MCP에 따로 적지 않는다. core에서 import 한다.
2. **한 파일에 두 주체가 쓰지 않는다.** 이게 깨지면 잠금이 필요해지고
   설계 전체가 무너진다.
3. **뷰어는 쓰지 않는다.** 앱은 읽기 전용. 쓰기는 MCP만.
