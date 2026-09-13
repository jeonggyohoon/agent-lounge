# 데이터 계약

앱과 MCP가 공유하는 유일한 인터페이스. **이 문서와 `packages/core/src/types.ts`
가 어긋나면 types.ts 가 맞다.** 여기는 설명, 거기가 정의다.

## 식별자

```
entry id   <YYYYMMDD>-<HHMM>-<actor>[-<n>]    20260913-1015-codex
actor      [a-z0-9-]+(@[a-z0-9-]+)?           claude-code@auth
session id <actor>-<ULID>                     codex-01JKQ8X4P2
```

중앙 카운터를 쓰지 않는다. 두 에이전트가 동시에 같은 번호를 집는 경합이
생긴다. 시각+행위자면 충돌이 구조적으로 불가능하고 정렬도 따라온다.
같은 분에 같은 actor가 두 번 쓰면 `-2` 를 붙인다.

파일명에 들어가므로 `@` 외의 특수문자는 거부한다.

## config.json

```json
{
  "project": "2dbus",
  "briefing": { "maxUnread": 5, "aboutMaxLength": 120, "titleMaxLength": 60 },
  "sweep": { "idleMinutes": 30 },
  "archive": { "afterResolvedDays": 7 }
}
```

`project` 는 **표시용 이름일 뿐이다.** 라운지 신원은 폴더 위치가 결정한다.
두 폴더에 같은 이름을 써도 서로 다른 라운지다.

## entry — `entries/<id>.md`

```yaml
---
id: 20260913-1015-codex
by: codex
at: 2026-09-13T10:15:00+09:00
area: api/auth
title: 로그인 API 응답 스펙 확정
about: auth 엔드포인트 3개의 요청/응답 형태와 에러코드 체계
to: [claude-code@auth]
state: open
refs:
  - path: docs/api/auth.md
    sha: a1b2c3d4
supersedes: null
reply_to: null
---
(본문 마크다운)
```

| 필드 | 필수 | 규칙 |
|---|---|---|
| `id` `by` `at` | ✔ | 서버가 주입. 클라이언트 지정 무시 |
| `area` | ✔ | 자유 경로 문자열. **폴더가 아니라 라벨** |
| `title` | ✔ | 60자 이내 |
| `about` | ✔ | **120자 이내. 빈 값 거부** |
| `to` | | 빈 배열 = 전체 공지 |
| `state` | ✔ | 기본 `open` |
| `refs` | | 작성 시점 sha 저장 |
| `supersedes` | | 뒤집는 항목 id |

`about` 강제가 이 설계의 방어선이다. 색인층이 무너지면 전부 본문을 열게
되고 목적 자체가 사라진다. 자르지 말고 거부한다.

## ack — `acks/<entry-id>/<actor>.json`

```json
{
  "entry": "20260913-1015-codex",
  "actor": "claude-code@auth",
  "state": "applied",
  "at": "2026-09-13T11:42:00+09:00",
  "opened_at": "2026-09-13T11:20:00+09:00",
  "note": "auth.ts 타입 교체하고 에러 핸들러 연결",
  "evidence": { "commit": "9f3c1a2", "files": ["src/types/auth.ts"] },
  "waiting_on": null
}
```

`state: blocked` → `waiting_on` 필수. `evidence` 는 정황이지 보증이 아니며
검증하지 않는다.

## session — `sessions/<id>.json`

```json
{
  "id": "codex-01JKQ8X4P2",
  "actor": "codex",
  "client": "codex",
  "cwd": "D:/project/2dbus",
  "joined_at": "2026-09-13T11:02:00+09:00",
  "last_seen": "2026-09-13T11:48:00+09:00",
  "state": "active",
  "left_at": null
}
```

**`abandoned` 를 `left` 와 반드시 구분한다.** 정상 반납은 "끝났다"지만
비정상 종료는 "반쯤 고쳐놨을 수 있다"라서 다음 사람의 행동이 달라져야 한다.

## watermark — `watermarks/<actor>.json`

```json
{ "actor": "claude-code@auth", "since": "2026-09-13T11:02:00+09:00" }
```

**최초 입장 시 1회만 생성되고 움직이지 않는다.** 입장마다 갱신하면 이전
세션의 미확인이 증발한다. 미확인 판정은 ack 유무가 담당하고, 워터마크는
합류 이전 과거를 잘라내는 역할만 한다.

## resume — `resume/<actor>.md`

미래의 자신에게 쓰는 메모. 매번 덮어쓴다. 항목과 성격이 다르므로 섞지 않는다.

## 계산 규칙

### 미확인
```
state == open
AND acks/<id>/<actor>.json 에 state 없음
AND ( actor ∈ to           # 지목은 워터마크 무시
      OR (to 비어있음 AND at > watermark.since) )
```

### supersede 경고
```
state == superseded
AND acks/<id>/<actor>.state == applied
```
워터마크와 ack를 모두 무시하고 강제로 띄운다. 대체 항목에 ack를 남기면 해소.

### stale
```
any(ref.sha != current_sha(ref.path))
```
읽을 때마다 계산하고 **저장하지 않는다.** 라운지는 진실이 아니고 코드가
진실이다. sha는 git이 있으면 `git hash-object`, 없으면 SHA-256 앞 8자.

### 게으른 스윕
데몬이 없으므로 아무 도구나 호출될 때 실행한다.
`now - last_seen > idleMinutes` 인 active 세션을 `abandoned` 로 바꾸고,
해당 세션의 resume이 없으면 `by: system` 항목을 생성한다.
