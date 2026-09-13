# 아키텍처

## 전체 구조

```
   브라우저                       ← 사용자가 여는 것
   재실 패널 / 타임라인
            │ SSE (변경 신호) + JSON (스냅숏)
            ▼
   뷰어 백엔드 (Node, 루프백)     ← 파일을 읽고 chokidar 로 감시
            │ 읽기 전용
            ▼
   <프로젝트>/.lounge/            ← 진실. 그냥 파일
            ▲
            │ 읽고 쓰기 (stdio)
   lounge-mcp                     ← 클라이언트가 자식 프로세스로 실행
            ▲
   Claude Code / Codex / Claude Desktop
```

**앱과 MCP는 서로를 모른다.** 같은 폴더를 볼 뿐이다. 그래서 앱이 꺼져
있어도 에이전트는 계속 작업하고, 앱을 켜면 그동안의 내용이 그대로 보인다.

## 경계

| 구성요소 | 책임 | 하지 않는 것 |
|---|---|---|
| `packages/core` | 타입, 상태 정의, 경로 규칙, 검증, 토큰, 파일 입출력 | UI, 네트워크, 정책 판단 |
| `packages/mcp` | 도구 6개, 브리핑 계산, 스윕 | 화면, 네트워크, 파일 형식 |
| `apps/viewer` | 표시, 파일 감시, 프로젝트 목록 | **쓰기 일절 금지** |

뷰어는 브라우저 화면과 작은 Node 백엔드로 나뉜다. 브라우저는 파일을 직접
열지 못하므로 백엔드가 읽어서 스냅숏으로 내준다.

| | 하는 일 |
|---|---|
| `apps/viewer/server` | 라운지 읽기, 감시, SSE. **GET 라우트만 있다** |
| `apps/viewer/src` | React 화면. 파일도 경로도 모른다 |

`core`가 단일 진실이다. 상태 이름·라벨·파일 경로 규칙을 앱과 MCP가
각자 적으면 반드시 어긋난다.

**파일을 읽고 쓰는 코드도 core에 둔다.** 앱과 MCP가 같은 파일을 읽으므로
frontmatter 파싱과 검증이 두 벌이 되면 경로 규칙이 어긋날 때와 똑같은 일이
벌어진다. 대신 진입점을 둘로 나눈다.

| 진입점 | 내용 | 쓰는 쪽 |
|---|---|---|
| `@lounge/core` | 타입, 토큰, 검증, frontmatter, 탐색, 읽기·쓰기 규칙 | 브라우저 번들 포함 누구나 |
| `@lounge/core/fs` | node 어댑터와 편의 함수 | mcp, 뷰어 백엔드 |

**파일을 실제로 여는 방법만 바깥에서 온다.** core는 `LoungeIO` 를 주입받고
`node:fs` 를 직접 부르지 않는다.

| 포트 | 가진 것 | 구현 |
|---|---|---|
| `LoungeIO` | 읽기 7개 | `nodeIO` — 뷰어 백엔드가 끼운다 |
| `LoungeWriteIO` | 읽기 + 쓰기 4개 | `nodeIO` — mcp가 끼운다 |

클래스도 같이 갈린다. `ReadonlyLounge` 는 `LoungeIO` 를, `Lounge` 는
`LoungeWriteIO` 를 받는다. **뷰어가 쓰지 않는 것이 규율에서 타입으로
내려왔다** — 참는 것이 아니라 부를 함수가 없다.

> 포트를 뺀 원래 이유는 Tauri 웹뷰에 Node가 없다는 것이었다. 뷰어가 로컬
> 웹앱이 되면서 **그 이유는 사라졌다** — 파일을 읽는 쪽이 이제 전부 Node다.
> 그래도 남긴다. 읽기와 쓰기를 타입으로 가르는 수단이 여기서 나오고,
> 파일 시스템 없이 메모리로 갈아 끼워 시험할 수 있기 때문이다.
> 이유가 바뀌었을 뿐 구조는 값을 한다.

core는 **어떻게 저장하는가**까지만 안다. 무엇이 미확인인지, 언제 스윕할지
같은 판단은 mcp의 몫이다.

## 저장소 레이아웃

```
<프로젝트>/.lounge/
  config.json
  LOUNGE.md
  entries/20260913-1015-codex.md        작성자만 씀
  acks/20260913-1015-codex/
    claude-code@auth.json               독자만 씀
  archive/2026-09/
  sessions/claude-code-01JKQ8.json      세션만 씀
  watermarks/claude-code@auth.json
  resume/claude-code@auth.md
```

**단일 작성자 원칙** — 한 파일을 두 주체가 쓰는 경우가 구조적으로 없다.
잠금, 트랜잭션, 병합 로직이 전부 불필요하다.

## git 분리

커밋한다 (프로젝트 지식)
```
.lounge/entries/  .lounge/acks/  .lounge/archive/
.lounge/LOUNGE.md  .lounge/config.json
```

`.gitignore` (머신 로컬 상태)
```
.lounge/sessions/  .lounge/watermarks/  .lounge/resume/
```

## 정체성

| | actor | session |
|---|---|---|
| 수명 | 영속 | 프로세스 1회 |
| 예 | `claude-code@auth`, `codex` | `claude-code@auth-01JKQ8` |
| 붙는 것 | 읽음, 워터마크, resume | 입퇴장, 활동 시각 |

세션에 읽음을 붙이면 재시작마다 전부 미확인으로 돌아간다. 이 분리가 전제.

**actor는 명시 지정한다.** MCP 설정에 `--actor claude-code@auth`.
자동 추론은 전부 함정이 있다 — PID는 재시작마다 바뀌고, 브랜치는 중간에
바뀌고, 폴더명은 worktree 공유와 충돌한다.

같은 일의 재시작이면 같은 actor, 다른 일의 병렬이면 다른 actor.
`lounge_join` 은 같은 actor의 active 세션이 있으면 경고만 하고 막지 않는다.

## 라운지 탐색

경로 문자열을 키로 쓰지 않는다. 대소문자, 하위 폴더 실행, 네트워크 드라이브
매핑 때문에 같은 폴더가 다른 라운지로 갈린다.

**git 과 같은 방식**: 현재 디렉터리에서 위로 올라가며 `.lounge/` 를 찾고
처음 만나는 것을 쓴다. `fs.realpath()` 로 정규화한다. 못 찾으면
**실패한다** — 조용히 새로 만들지 않는다.

Claude Desktop은 작업 디렉터리가 없으므로 `.mcpb` 설정에서 받은 경로를
시작점으로 삼는다.

worktree는 형제 폴더라 위로 올라가도 못 찾는다. `.lounge/ref` 포인터
파일로 main 의 라운지를 공유한다 (MVP 이후).

## 실시간 반영

뷰어 백엔드가 `chokidar` 로 `.lounge/` 를 지켜본다. 파일이 바뀌면 붙어 있는
브라우저에 **SSE** 로 신호를 보내고, 화면은 스냅숏을 다시 가져온다.
폴링도 웹소켓도 없다 — 신호가 한 방향으로만 흐르므로 SSE 로 충분하다.

신호에는 **무엇이 바뀌었는지 담지 않는다.** 화면은 통째로 다시 읽는다.
항목 수백 개 규모에서 이게 부분 갱신보다 싸고, 무엇보다 화면이 파일과
어긋날 수 없다.

라운지 폴더 하나당 감시자 하나다. 창을 여러 개 열어도 감시자는 늘지 않는다.

**에이전트 쪽은 실시간이 아니다.** 파일은 즉시 갱신되지만 상대가 알아채는
건 다음 도구 호출 때다. 이건 의도된 선택 — 작업 중에 끼어들면 컨텍스트가
오염된다. 세션 도중 확인이 필요하면 `lounge_digest()` 를 부른다.

## 기술 스택

```
공통    TypeScript, zod, yaml
core    zod, yaml 뿐. 파일 접근은 주입받고 직접 열지 않음
mcp     @modelcontextprotocol/sdk (stdio)
viewer  React + Vite (화면), Node + chokidar + SSE (백엔드)
```

DB 없음. 캐시 없음. 프로세스 상태 없음. 모든 상태는 파일에서 매번 읽는다.
항목 수백 개 규모에서 성능 문제 없고, 여러 프로세스가 붙어도 안전하다.
