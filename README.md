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
  .claude-plugin/       Claude Code 플러그인 매니페스트
  hooks/hooks.json      세션 시작/종료 훅
  templates/            다른 프로젝트에 붙일 때 쓰는 조각
  CLAUDE.md             이 저장소의 Claude Code 진입 규칙
  AGENTS.md             이 저장소의 Codex 진입 규칙
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

프로젝트 폴더에서 띄우는 법은 「다른 프로젝트에 라운지 붙이기」의 5단계에 있다.
아래는 **뷰어 자체를 고칠 때** 쓰는 개발 모드다.

```
pnpm --filter @lounge/viewer dev           # http://localhost:5173
```

백엔드는 `pnpm dev` 가 함께 띄운다. 다른 폴더를 보려면 `LOUNGE_PROJECT` 를
주거나 화면에서 경로를 넣는다. 백엔드만 따로 띄우려면 `pnpm serve` 다.

빌드 산출물은 두 갈래다.

```
apps/viewer/dist/
  cli.js       프로젝트 폴더에서 실행하는 진입점
  web/         화면 번들
```

읽기 전용이고 세 겹으로 막는다.

1. 백엔드가 `ReadonlyLounge` 만 만든다 — 쓰기 메서드가 객체에 없다
2. 라우트가 전부 GET 이다 — `Route['method']` 가 `'GET'` 리터럴이라 쓰기
   라우트는 타입이 거부하고, GET 외의 메서드는 405 로 끊는다
3. 프런트엔드 소스에 `@lounge/core/fs` 도 `node:fs` 도 없다

셋 다 테스트가 지킨다.

**이 서버를 밖으로 노출하지 않는다.** `127.0.0.1` 에만 묶고 CORS 헤더를
두지 않는 것이 방어의 전부다.

## 다른 프로젝트에 라운지 붙이기

이 저장소는 **도구를 만드는 곳**이고, 라운지는 **작업하는 프로젝트**에 놓인다.
아래는 `~/work/myapp` 에 붙이는 절차다.

### 1. 이 저장소를 빌드한다

```
git clone <이 저장소> ~/tools/lounge
cd ~/tools/lounge && pnpm install && pnpm build
```

플러그인이 한 덩어리로 떨어지는 형태가 아니다. MCP 서버는 빌드된
`packages/mcp/dist/index.js` 를 직접 실행한다.

### 2. 라운지를 놓는다

```
node ~/tools/lounge/packages/mcp/dist/index.js --init --cwd ~/work/myapp
```

`.lounge/` 와 `config.json`, `LOUNGE.md`, `.lounge/.gitignore` 가 생긴다.
**프로젝트가 소유한 파일은 건드리지 않는다** — `.gitignore` 나 `CLAUDE.md` 에
넣을 내용은 출력만 하고 직접 고치지 않는다.

이미 있으면 덮어쓰지 않는다. 서버는 탐색 중에 라운지를 **절대 만들지 않는다**.
만드는 길은 이 명령 하나뿐이다.

### 3. MCP 를 등록한다

**actor 를 클라이언트마다 다르게 준다.** 같은 actor 를 쓰면 읽음 기록이
섞여서 미확인 계산이 전부 어긋난다.

| 클라이언트 | 넣는 곳 | 조각 |
|---|---|---|
| Claude Code | `~/work/myapp/.mcp.json` | `templates/.mcp.json` |
| Codex | `~/.codex/config.toml` | `templates/codex-config.toml` |
| Claude Desktop | `claude_desktop_config.json` | `templates/claude-desktop.json` |

Claude Code 는 `.mcp.json` 대신 한 줄로도 된다.

```
claude mcp add lounge -- node ~/tools/lounge/packages/mcp/dist/index.js   --actor claude-code --cwd ~/work/myapp
```

**Claude Desktop 에는 `--cwd` 가 반드시 필요하다.** 작업 디렉터리가 없어서
없으면 라운지를 찾지 못하고 시작에 실패한다. Claude Code 와 Codex 도
프로젝트 밖에서 띄울 수 있으니 넣어두는 편이 안전하다.

### 4. 진입 규칙을 둔다

`templates/CLAUDE.md` 와 `templates/AGENTS.md` 를 `~/work/myapp` 에 복사한다.
이미 있으면 「라운지」 절만 덧붙인다.

Claude Code 는 세션 훅으로도 알리지만 **Codex 에는 세션 시작 훅이 없어서
`AGENTS.md` 가 유일한 알림**이다. 빼먹으면 Codex 는 라운지를 쓰지 않는다.

### 5. 뷰어를 띄운다

**프로젝트 폴더에서 그대로 실행한다.** 현재 위치에서 위로 올라가며 라운지를
찾고, 빈 포트를 골라 백엔드를 띄우고 브라우저를 연다.

```
cd ~/work/myapp
node ~/tools/lounge/apps/viewer/dist/cli.js
```

```
라운지   ~/work/myapp/.lounge
프로젝트 myapp
열림     http://127.0.0.1:5174
```

하위 폴더에서 실행해도 같은 라운지에 붙는다. **프로젝트를 여러 개 동시에
띄울 수 있다** — 포트가 겹치면 다음 빈 포트로 넘어간다.

| 플래그 | |
|---|---|
| `--no-open` | 브라우저를 열지 않는다 |
| `--port <n>` | 포트를 고정한다 |
| `--cwd <경로>` | 다른 폴더의 라운지를 연다 |

**라운지가 없으면 만들지 않고 종료한다.** MCP 서버와 같은 규칙이고 같은 종료
코드(`3`)를 쓴다. `--init` 명령을 그대로 출력하니 그것만 복사해 실행하면 된다.

전역 링크를 걸면 `lounge-viewer` 로 부를 수 있다.

```
cd ~/tools/lounge/apps/viewer && pnpm link --global
cd ~/work/myapp && lounge-viewer
```

`npx lounge-viewer` 는 이 패키지가 `lounge-viewer` 라는 이름으로 npm 에
배포된 뒤에나 동작한다. 지금은 `@lounge/viewer` 이고 `private` 이다.

### 6. 확인한다

각 클라이언트에서 `lounge_join` 을 부른다. 같은 라운지 경로가 나오면 붙은
것이다. 한쪽에서 `lounge_post` 하고 다른 쪽에서 `lounge_join` 했을 때
미확인으로 뜨면 끝이다. 뷰어를 띄워 두면 항목이 올라오는 것이 1초 안에 보인다.

### git

`.lounge/entries/` 와 `acks/` 는 **프로젝트 지식이므로 커밋한다.**
`sessions/` `watermarks/` `resume/` 는 머신 로컬 상태이고,
`--init` 이 놓은 `.lounge/.gitignore` 가 이미 가른다.

## Claude Code 플러그인으로 쓰기

`.claude-plugin/plugin.json` 이 MCP 서버를 인라인으로 선언한다.

**저장소 루트에 `.mcp.json` 을 두지 않는다.** 플러그인 매니페스트와 프로젝트
설정으로 이중 로드되는데, 프로젝트 쪽에서는 `${CLAUDE_PLUGIN_ROOT}` 가
정의되지 않아 서버가 뜨지 않는다. 그래서 선언은 `plugin.json` 안에만 둔다.

## 절대 규칙

1. **`packages/core`가 단일 진실이다.** 상태 이름, 라벨, 색 이름, 파일 경로
   규칙을 앱이나 MCP에 따로 적지 않는다. core에서 import 한다.
2. **한 파일에 두 주체가 쓰지 않는다.** 이게 깨지면 잠금이 필요해지고
   설계 전체가 무너진다.
3. **뷰어는 쓰지 않는다.** 앱은 읽기 전용. 쓰기는 MCP만.
