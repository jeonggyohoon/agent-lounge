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
    src/rules.ts        문서에 그대로 실리는 규약 문장의 원본
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
| `@lounge/core` | 타입, 토큰, 검증, frontmatter, 탐색과 읽기·쓰기 규칙. node 내장 모듈을 쓰지 않는다 |
| `@lounge/core/fs` | node 어댑터와 편의 함수 |

```ts
import { discoverLounge } from '@lounge/core/fs';

const lounge = await discoverLounge();   // 못 찾으면 던진다. 만들지 않는다
for (const { entry } of await lounge.listEntries()) {
  console.log(entry.about);
}
```

node 가 아닌 런타임이면 `LoungeIO` 를 구현해 끼운다. core 는 고치지 않는다.

```ts
import { discoverReadonlyLounge } from '@lounge/core';

const lounge = await discoverReadonlyLounge(myIO, projectDir);
```

## MCP 서버

```
lounge-mcp --actor claude-code@auth [--client <이름>] [--cwd <경로>]
```

`--actor` 는 필수다. 없으면 시작하지 않는다 — 자동 추론은 PID·브랜치·폴더명
전부 함정이 있고, 틀린 actor 로 조용히 도는 것이 가장 나쁘다.

라운지를 못 찾아도 시작하지 않는다. 조용히 만들지 않는다.

도구는 `lounge_join` `lounge_post` `lounge_open` `lounge_ack` `lounge_leave`
`lounge_digest` 여섯이다. 규약은 `skills/lounge/SKILL.md` 에 있다.

## 뷰어

```
pnpm --filter @lounge/viewer dev           # http://localhost:5173
```

백엔드는 `pnpm dev` 가 함께 띄운다. 다른 폴더를 보려면 `LOUNGE_PROJECT` 를
주거나 화면에서 경로를 넣는다. 백엔드만 따로 띄우려면 `pnpm serve` 다.

읽기 전용이고 세 겹으로 막는다.

1. 백엔드가 `ReadonlyLounge` 만 만든다 — 쓰기 메서드가 객체에 없다
2. 라우트가 전부 GET 이다 — `Route['method']` 가 `'GET'` 리터럴이라 쓰기
   라우트는 타입이 거부하고, GET 외의 메서드는 405 로 끊는다
3. 프런트엔드 소스에 `@lounge/core/fs` 도 `node:fs` 도 없다

셋 다 테스트가 지킨다.

**이 서버를 밖으로 노출하지 않는다.** `127.0.0.1` 에만 묶고 CORS 헤더를
두지 않는 것이 방어의 전부다.

## 절대 규칙

1. **`packages/core`가 단일 진실이다.** 상태 이름, 라벨, 색 이름, 파일 경로
   규칙을 앱이나 MCP에 따로 적지 않는다. core에서 import 한다.
2. **한 파일에 두 주체가 쓰지 않는다.** 이게 깨지면 잠금이 필요해지고
   설계 전체가 무너진다.
3. **뷰어는 쓰지 않는다.** 앱은 읽기 전용. 쓰기는 MCP만.
