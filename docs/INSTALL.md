# 설치와 사용

lounge 를 처음 받아서 다른 프로젝트에 붙이는 사람을 위한 문서다.

lounge 저장소는 **도구를 두는 곳**이고, 라운지(`.lounge/`)는 **작업하는
프로젝트마다** 생긴다. 저장소는 한 번만 놓고 프로젝트마다 붙인다.

---

## 1. lounge 를 어디에 둘 것인가

**경로가 프로젝트마다 `.mcp.json` 에 박힌다.** MCP 서버도 뷰어도 절대 경로로
실행되므로, 한 번 정하면 옮기기 어렵다.

### 권장 위치

```
~/tools/lounge          macOS, Linux
C:\tools\lounge         Windows
```

이 자리를 권하는 이유는 셋이다.

- **어느 프로젝트에도 속하지 않는다.** 프로젝트 안에 두면 그 프로젝트를
  지울 때 다른 프로젝트들의 라운지가 같이 죽는다
- **지워질 일이 없다.** `Downloads`, `Desktop`, 임시 폴더는 피한다
- **동기화 폴더가 아니다.** OneDrive, Dropbox, iCloud 아래에 두면 파일
  감시가 오작동하고 `node_modules` 동기화로 느려진다

`node_modules` 가 있어야 돈다. 빌드 산출물만 복사해 가면 `chokidar` 를
찾지 못한다.

### 옮기게 되면

**저장소를 옮기면 붙여둔 프로젝트가 전부 깨진다.** 경로가 박힌 곳을 전부
고쳐야 한다.

| 고칠 것 | 어디 |
|---|---|
| Claude Code | 프로젝트마다 `<프로젝트>/.mcp.json` |
| Codex | `~/.codex/config.toml` 의 `[mcp_servers.lounge]` |
| Claude Desktop | `claude_desktop_config.json` |
| 뷰어 실행 | 쓰던 명령어, 별칭, 스크립트 |

프로젝트를 여럿 붙였다면 빠짐없이 찾는 것이 쉽지 않다. **처음에 자리를
정하는 편이 낫다.**

---

## 2. 최초 설치

### 요건

| | |
|---|---|
| Node | **20.11 이상.** 22 LTS 를 권한다 |
| pnpm | 9 이상. 저장소는 `pnpm@11.1.3` 로 굳혀 두었다 |
| git | 저장소를 받을 때만 쓴다 |

> `refs` 지문은 **git 명령을 부르지 않는다.** 대상 프로젝트가 git 저장소면
> `git hash-object` 와 같은 값을 직접 계산하고, 아니면 SHA-256 을 쓴다.
> 어느 쪽이든 앞 8자만 남긴다.

```
node --version
pnpm --version
```

pnpm 이 없으면 `npm install -g pnpm` 으로 넣는다.

### 받아서 빌드하기

아래 `~/tools/lounge` 는 1절에서 정한 자리로 바꾼다.

```
git clone <저장소 URL> ~/tools/lounge
cd ~/tools/lounge
pnpm install
pnpm build
```

Windows PowerShell 이면 경로만 바꾼다.

```
git clone <저장소 URL> C:\tools\lounge
cd C:\tools\lounge
pnpm install
pnpm build
```

### 무엇이 생기나

빌드가 끝나면 **이 두 파일이 이후 모든 절차에 쓰인다.**

```
packages/mcp/dist/index.js      MCP 서버 + --init
apps/viewer/dist/cli.js         뷰어 실행기
```

곁들여 생기는 것들.

```
packages/core/dist/             두 쪽이 함께 쓰는 타입·검증·토큰
apps/viewer/dist/web/           뷰어 화면 번들
```

확인한다.

```
ls ~/tools/lounge/packages/mcp/dist/index.js
ls ~/tools/lounge/apps/viewer/dist/cli.js
```

둘 중 하나라도 없으면 `pnpm build` 가 끝까지 돌지 않은 것이다.

---

## 3. 대상 프로젝트에 붙이기

아래에서 `<프로젝트>` 는 **라운지를 붙일 프로젝트 폴더의 절대 경로**다.
예: `~/work/myapp`, `D:\project\myapp`.

`<lounge>` 는 **1절에서 정한 lounge 저장소 경로**다.
예: `~/tools/lounge`, `C:\tools\lounge`.

### 3.1 라운지를 놓는다

```
node <lounge>/packages/mcp/dist/index.js --init --cwd <프로젝트>
```

`<프로젝트>/.lounge/` 가 생긴다.

```
config.json        표시용 이름과 한도값
LOUNGE.md          이 라운지의 규약
.gitignore         머신 로컬 상태를 git 에서 뺀다
entries/ acks/ archive/ sessions/ watermarks/ resume/
```

**프로젝트가 소유한 파일은 건드리지 않는다.** `.gitignore` 나 `CLAUDE.md` 에
넣을 내용은 출력만 하고 직접 고치지 않는다.

이미 있으면 덮어쓰지 않고 그 사실만 알린다. 표시용 이름을 따로 주려면
`--project <이름>` 을 붙인다. 안 주면 폴더 이름을 쓴다.

> **이것이 라운지를 만드는 유일한 길이다.** MCP 서버도 뷰어도 라운지를 찾지
> 못하면 **만들지 않고 실패한다.** 조용히 만들면 오타 난 경로에 빈 라운지가
> 생기고, 다른 클라이언트와 갈라진 채 각자 잘 도는 것처럼 보인다.

### 3.2 actor 이름을 정한다

actor 는 **읽음 기록이 붙는 이름**이다. 세션이 아니라 사람(또는 역할)에
가깝고, 재시작해도 유지된다.

```
[a-z0-9-]+ 또는 [a-z0-9-]+@[a-z0-9-]+
```

소문자, 숫자, `-` 만 쓴다. 영역은 `@` 로 붙인다. 파일명에 그대로 들어가므로
`@` 외의 특수문자는 거부된다.

**클라이언트마다 다르게 준다.**

| 클라이언트 | actor |
|---|---|
| Claude Code | `claude-code` |
| Codex | `codex` |
| Claude Desktop | `claude-desktop` |

같은 actor 를 둘이 쓰면 **읽음 기록이 섞여서 미확인 계산이 전부 어긋난다.**
한쪽이 읽은 것을 다른 쪽도 읽은 것으로 친다.

**같은 클라이언트를 여러 개 띄우면 `@라벨` 을 붙인다.**

```
claude-code@auth      인증 작업을 하는 창
claude-code@ui        화면 작업을 하는 창
```

기준은 이렇다.

- **같은 일의 재시작이면 같은 actor.** 창을 닫았다 열어도 이어서 일하는
  것이면 이름을 바꾸지 않는다. 바꾸면 미확인이 처음부터 다시 쌓인다
- **다른 일의 병렬이면 다른 actor.** 인증과 화면을 동시에 만지고 있으면
  서로 다른 것을 봐야 한다

### 3.3 MCP 를 등록한다

**Claude Code** — 한 줄이면 된다.

```
cd <프로젝트>
claude mcp add lounge -- node <lounge>/packages/mcp/dist/index.js --actor claude-code --cwd <프로젝트>
```

손으로 쓰려면 `<프로젝트>/.mcp.json` 에 넣는다. `templates/.mcp.json` 과 같다.

```json
{
  "mcpServers": {
    "lounge": {
      "command": "node",
      "args": [
        "<lounge>/packages/mcp/dist/index.js",
        "--actor", "claude-code",
        "--cwd", "<프로젝트>"
      ]
    }
  }
}
```

**Codex** — `~/.codex/config.toml` 에 덧붙인다. `templates/codex-config.toml`
과 같다.

```toml
[mcp_servers.lounge]
command = "node"
args = [
  "<lounge>/packages/mcp/dist/index.js",
  "--actor", "codex",
  "--client", "codex",
  "--cwd", "<프로젝트>",
]
```

**Claude Desktop** — `claude_desktop_config.json` 에 넣는다.
macOS 는 `~/Library/Application Support/Claude/`,
Windows 는 `%APPDATA%/Claude/` 아래다. `templates/claude-desktop.json` 과 같다.

```json
{
  "mcpServers": {
    "lounge": {
      "command": "node",
      "args": [
        "<lounge>/packages/mcp/dist/index.js",
        "--actor", "claude-desktop",
        "--client", "claude-desktop",
        "--cwd", "<프로젝트>"
      ]
    }
  }
}
```

> **Claude Desktop 에는 `--cwd` 가 반드시 필요하다.** 작업 디렉터리가 없어서
> 없으면 라운지를 찾지 못하고 시작에 실패한다. Claude Code 와 Codex 는
> 프로젝트 폴더에서 띄우면 생략해도 되지만, 넣어두는 편이 안전하다.

`--actor` 가 없으면 **서버가 뜨지 않는다.** 자동 추론은 전부 함정이 있어서
(PID 는 재시작마다 바뀌고, 브랜치는 중간에 바뀌고, 폴더명은 worktree 공유와
충돌한다) 명시 지정만 받는다.

### 3.4 진입 규칙을 둔다

**에이전트는 도구가 있다는 것만으로 쓰지 않는다.** 언제 부르는지 적어줘야 한다.

```
cp <lounge>/templates/CLAUDE.md <프로젝트>/CLAUDE.md
cp <lounge>/templates/AGENTS.md <프로젝트>/AGENTS.md
```

**이미 `CLAUDE.md` 나 `AGENTS.md` 가 있으면 덮어쓰지 않는다.**
템플릿의 「라운지」 절만 잘라 기존 파일 **끝에 덧붙인다.**

```
cat <lounge>/templates/CLAUDE.md >> <프로젝트>/CLAUDE.md
cat <lounge>/templates/AGENTS.md >> <프로젝트>/AGENTS.md
```

덧붙인 뒤 맨 앞의 `# 프로젝트 규칙` 제목이 중복되면 지운다.

> 이 저장소를 **Claude Code 플러그인으로 설치**했다면 세션 시작·종료 훅이
> 같이 붙어서 한 번 더 알린다. 하지만 `.mcp.json` 만 등록한 경우에는
> **훅이 없다.** 그때는 Claude Code 도 Codex 도 이 문서가 유일한 알림이다.

### 3.5 확인한다

각 클라이언트를 새로 띄우고 `lounge_join` 을 부른다.

```
<프로젝트 이름> 라운지 · claude-code · 미확인 없음
```

한쪽에서 항목을 남기고 다른 쪽에서 다시 들어가 미확인으로 뜨면 붙은 것이다.

---

## 4. 쓰기

### 4.1 뷰어 띄우기

**프로젝트 폴더에서 그대로 실행한다.**

```
cd <프로젝트>
node <lounge>/apps/viewer/dist/cli.js
```

```
라운지   <프로젝트>/.lounge
프로젝트 myapp
열림     http://127.0.0.1:5174
```

현재 위치에서 위로 올라가며 라운지를 찾으므로 **하위 폴더에서 실행해도 된다.**
빈 포트를 골라 띄우고 브라우저를 연다. **프로젝트를 여러 개 동시에 띄울 수
있다** — 포트가 겹치면 다음 빈 포트로 넘어간다.

| 플래그 | |
|---|---|
| `--no-open` | 브라우저를 열지 않는다 |
| `--port <n>` | **이 포트로만 연다.** 막혀 있으면 다른 데로 옮기지 않고 실패한다 |
| `--cwd <경로>` | 다른 폴더의 라운지를 연다 |

전역 링크를 걸면 이름으로 부를 수 있다.

```
cd <lounge>/apps/viewer && pnpm link --global
cd <프로젝트> && lounge-viewer
```

`npx lounge-viewer` 는 이 패키지가 `lounge-viewer` 라는 이름으로 npm 에
배포된 뒤에나 동작한다. 지금은 `@lounge/viewer` 이고 `private` 이다.

뷰어는 **읽기 전용**이다. 화면에서 아무것도 고칠 수 없고, 백엔드에 쓰기
엔드포인트가 없다.

### 4.2 세션에서 일어나는 일

```
lounge_join        입장. 브리핑을 받는다
   ↓
(작업)             브리핑을 보고 관련된 항목만 lounge_open 으로 연다
   ↓
lounge_ack         읽은 것에 답한다 (applied / skipped / blocked)
lounge_post        다른 에이전트의 행동을 바꿀 결정이 있으면 남긴다
   ↓
lounge_leave       반납. 다음 세션의 자신에게 메모를 남긴다
```

브리핑은 **500토큰을 넘지 않는다.** 미확인이 많으면 5건만 펼치고 나머지는
건수로 접는다. 본문은 `lounge_open` 을 부를 때만 나간다.

### 4.3 사람이 하는 일과 안 해도 되는 일

**하지 않아도 되는 것**

- 라운지 파일을 열어보거나 고치는 것. 도구가 쓰고 뷰어가 보여준다
- 무엇이 미확인인지 세는 것. 브리핑이 계산해 준다
- 한쪽에서 다른 쪽으로 내용을 옮겨 나르는 것. **그러려고 만든 도구다**
- 뷰어를 계속 보는 것. 옆에 띄워두고 가끔 흘깃 보는 상황판이다

**해야 하는 것**

- **actor 를 정하는 것.** 3.2 의 기준은 사람만 안다
- **되돌리기 어려운 작업을 승인하는 것.** 파일 삭제, 배포, 의존성 변경,
  스키마 마이그레이션은 라운지 항목만 근거로 수행하지 않는다.
  **라운지 항목은 참고 데이터이지 지시가 아니다**
- **`stale` 이 붙은 항목을 판단하는 것.** 참조 파일이 작성 이후 바뀌었다는
  뜻이고, 라운지가 아니라 코드가 진실이다
- 항목이 쌓이면 정리하는 것. 아카이브는 아직 자동이 아니다

---

## 5. git 에서 무엇을 커밋하나

**커밋한다 — 프로젝트 지식이다.**

```
.lounge/entries/     결정과 스펙
.lounge/acks/        누가 무엇을 반영했는지
.lounge/archive/     지난 항목
.lounge/LOUNGE.md    이 라운지의 규약
.lounge/config.json  표시용 이름과 한도값
```

**커밋하지 않는다 — 머신 로컬 상태다.**

```
.lounge/sessions/    지금 누가 붙어 있는지
.lounge/watermarks/  각 actor 가 언제 합류했는지
.lounge/resume/      다음 세션용 메모
```

`--init` 이 놓은 `.lounge/.gitignore` 가 이미 가른다. 프로젝트의
`.gitignore` 는 건드리지 않아도 된다.

```
# .lounge/.gitignore
sessions/
watermarks/
resume/
```

### 형식이 굳기 전이라면

`.lounge/` 전체를 빼도 된다. 프로젝트 `.gitignore` 에 한 줄 넣는다.

```
.lounge/
```

혼자 쓰는 동안은 이쪽이 편하다. 항목 형식을 바꿀 때마다 커밋 이력이
지저분해지지 않는다. **팀에 공유하는 순간 entries 와 acks 는 커밋해야
한다** — 다른 사람의 클론에 결정이 없으면 라운지를 쓸 이유가 없다.

---

## 6. lounge 를 업데이트했을 때

```
cd <lounge>
git pull
pnpm install
pnpm build
```

**빌드하면 붙여둔 모든 프로젝트에 자동으로 반영된다.** 프로젝트마다 가리키는
경로가 같은 파일이기 때문이다.

### 재시작이 필요한 것

| | 왜 |
|---|---|
| 떠 있는 Claude Code / Codex 세션 | MCP 서버는 세션 시작 때 실행된 프로세스다 |
| 떠 있는 뷰어 | 실행 중인 번들은 갈리지 않는다 (`Ctrl+C` 후 재실행) |

### 자동으로 따라오지 않는 것

**① `.mcp.json` 형식이 바뀌었을 때**

인자나 구조가 바뀌면 프로젝트마다 고쳐야 한다. 그런 변경은 릴리스 노트에
적힌다. 확인하려면 `templates/.mcp.json` 과 내 것을 비교한다.

**② 복사본**

아래는 **한 번 복사된 뒤 각자의 것**이 된다. 업데이트해도 바뀌지 않는다.

| 파일 | 원본 |
|---|---|
| `<프로젝트>/.lounge/LOUNGE.md` | `--init` 이 생성 |
| `<프로젝트>/CLAUDE.md` | `<lounge>/templates/CLAUDE.md` |
| `<프로젝트>/AGENTS.md` | `<lounge>/templates/AGENTS.md` |

일부러 그렇게 했다. `LOUNGE.md` 는 **그 라운지가 합의한 규약**이라 프로젝트마다
다를 수 있고, `CLAUDE.md` 는 프로젝트의 다른 규칙과 섞여 있다. 덮어쓰면
그 프로젝트가 쌓은 것을 지운다.

원본이 바뀌었는지 보려면 비교한다.

```
diff <lounge>/templates/CLAUDE.md <프로젝트>/CLAUDE.md
```

---

## 7. 막혔을 때

### `/mcp` 에 lounge 가 안 보인다

Claude Code 안에서 `/mcp` 를 친다. 목록에 없으면 설정을 못 읽은 것이다.

```
# 프로젝트 루트에 있는가
ls <프로젝트>/.mcp.json

# JSON 이 깨지지 않았는가
node -e "JSON.parse(require('fs').readFileSync('<프로젝트>/.mcp.json','utf8'))"
```

- `.mcp.json` 은 **프로젝트 루트**에 있어야 한다. 하위 폴더는 안 읽는다
- Claude Code 를 **그 폴더에서** 띄웠는지 확인한다
- 프로젝트 MCP 는 **처음 쓸 때 승인**을 묻는다. 거절했으면 다시 띄운다

직접 실행해 보면 원인이 바로 보인다.

```
node <lounge>/packages/mcp/dist/index.js --actor claude-code --cwd <프로젝트>
```

| 종료 코드 | 뜻 | 할 일 |
|---|---|---|
| `2` | actor 가 없거나 형식이 어긋남 | `--actor` 를 확인한다 (3.2) |
| `3` | 라운지를 못 찾음 | `--init` 을 먼저 한다 (3.1) |

뷰어도 같은 자리에서 `3` 을 쓰고, `--port` 로 지정한 자리가 막혀 있으면
`4` 로 끝난다.

정상이면 `라운지 <경로>` 와 `actor ... · 세션 ...` 이 뜨고 그대로 떠 있는다.
`Ctrl+C` 로 끈다.

### connected 인데 도구를 안 쓴다

서버는 붙었는데 에이전트가 `lounge_join` 을 안 부르는 경우다.
**거의 항상 진입 규칙이 없는 것이다.**

```
# 라운지 규칙이 들어 있는가
grep -l "lounge_join" <프로젝트>/CLAUDE.md <프로젝트>/AGENTS.md
```

없으면 3.4 를 한다. 있는데도 안 부르면 그냥 시켜도 된다.

```
lounge_join 을 호출해서 브리핑을 확인해 줘
```

Codex 는 `AGENTS.md` 만 읽는다. `CLAUDE.md` 에만 적어두면 Codex 는 모른다.

### 뷰어가 라운지를 못 찾는다

```
<경로> 및 상위 경로에서 .lounge/ 를 찾지 못했습니다.
뷰어는 라운지를 만들지 않습니다. 먼저 놓으세요.
```

- 라운지가 정말 있는지 본다 — `ls <프로젝트>/.lounge`
- **다른 폴더에서 띄웠을 수 있다.** `--cwd <프로젝트>` 로 명시한다
- 없으면 3.1 을 한다. 뷰어는 만들지 않는다

`.lounge` 는 숨김 폴더라 `ls` 에 안 보일 수 있다. `ls -a` 로 본다.

### 포트가 충돌한다

뷰어는 5174 부터 5199 까지 훑고, 다 막혀 있으면 OS 에게 받는다.
**보통은 그냥 뜬다.** 그래도 막히면 무엇이 물고 있는지 본다.

```
# macOS, Linux
lsof -i :5174

# Windows PowerShell
Get-NetTCPConnection -LocalPort 5174 -State Listen
```

이전에 띄운 뷰어가 남아 있는 경우가 많다. 출력된 주소를 열어보면 어느
프로젝트인지 알 수 있다.

```
curl -s http://127.0.0.1:5174/api/default
```

자리를 정해서 띄우려면 지정한다.

```
node <lounge>/apps/viewer/dist/cli.js --port 6100
```

**지정한 자리가 막혀 있으면 옮겨 뜨지 않고 실패한다.**

```
포트 6100 이(가) 이미 사용 중입니다.
--port 를 빼면 빈 포트를 자동으로 찾습니다.
```

`--port 6100` 이라고 했는데 6100 이 아닌 곳에 떠 있으면 어느 창이 어느
프로젝트인지 알 수 없다. 그래서 조용히 옮기지 않는다. 자동으로 찾기를
원하면 지정하지 않는 것이 그 뜻이다.

### 그래도 안 되면

빌드가 최신인지부터 본다. 소스만 받고 빌드를 안 한 경우가 흔하다.

```
cd <lounge> && pnpm install && pnpm build
pnpm test
```
