/**
 * 파일 접근 포트.
 *
 * core 는 **어떤 런타임에서 도는지 모른다.** node 는 `node:fs` 로, Tauri 웹뷰는
 * 플러그인으로 파일을 읽는데, 라운지 탐색·파싱·검증 규칙은 양쪽이 같아야 한다.
 * 그 규칙을 한 벌로 두려고 바깥으로 뺀 것이 이 인터페이스다.
 *
 * **읽기와 쓰기를 타입으로 가른다.** 뷰어는 `LoungeIO` 만 구현하므로
 * 쓰기 함수를 부르고 싶어도 부를 대상이 없다. 규율이 아니라 타입이 막는다.
 */

/** 읽기만. 뷰어가 구현하는 것은 여기까지다. */
export interface LoungeIO {
  /** 없으면 `null`. 없는 것은 오류가 아니다 — 라운지는 대부분 비어 있다. */
  readText(path: string): Promise<string | null>;

  /** 지문 계산용. 없으면 `null`. */
  readBytes(path: string): Promise<Uint8Array | null>;

  /** 폴더가 없으면 빈 배열. 이름만 돌려준다. */
  listDir(path: string): Promise<string[]>;

  exists(path: string): Promise<boolean>;

  isDirectory(path: string): Promise<boolean>;

  /**
   * 대소문자와 심볼릭 링크를 정규화한다.
   * 정규화할 수단이 없는 런타임이면 받은 값을 그대로 돌려줘도 된다.
   */
  realpath(path: string): Promise<string>;

  /** 16진 소문자. git 의 blob 해시를 만들 때 쓴다. */
  sha1(bytes: Uint8Array): Promise<string>;

  /** 16진 소문자. git 저장소가 아닐 때의 지문. */
  sha256(bytes: Uint8Array): Promise<string>;
}

/** 쓰기까지. MCP 만 구현한다. */
export interface LoungeWriteIO extends LoungeIO {
  /** 부모 폴더가 없으면 만든다. */
  writeText(path: string, data: string): Promise<void>;

  mkdirp(path: string): Promise<void>;

  /** 같은 이름이 있으면 덮어쓴다. 원자적 쓰기의 마지막 단계다. */
  rename(from: string, to: string): Promise<void>;

  /** 임시 파일 정리용. 없는 파일을 지워도 오류가 아니다. */
  remove(path: string): Promise<void>;
}

/** 런타임이 쓰기까지 할 수 있는가. */
export function canWrite(io: LoungeIO): io is LoungeWriteIO {
  return typeof (io as LoungeWriteIO).writeText === 'function';
}

/** 바이트 배열을 16진 문자열로. 어댑터가 공통으로 쓴다. */
export function toHex(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out = '';
  for (const byte of view) out += byte.toString(16).padStart(2, '0');
  return out;
}
