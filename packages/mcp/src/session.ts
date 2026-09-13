/**
 * 세션 정체성.
 *
 * actor 는 영속이고 세션은 프로세스 1회다. 읽음과 워터마크는 actor 에,
 * 입퇴장과 활동 시각은 세션에 붙는다. 세션에 읽음을 붙이면 재시작마다
 * 전부 미확인으로 돌아간다 — 이 분리가 라운지의 전제다.
 */
import { randomBytes } from 'node:crypto';

/** Crockford base32. I, L, O, U 가 빠져 있어 사람이 옮겨 적어도 안 헷갈린다. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function encodeTime(at: number, length: number): string {
  let out = '';
  let rest = at;
  for (let i = 0; i < length; i += 1) {
    out = ALPHABET[rest % 32]! + out;
    rest = Math.floor(rest / 32);
  }
  return out;
}

function encodeRandom(length: number): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += ALPHABET[bytes[i]! % 32]!;
  return out;
}

/**
 * ULID. 앞 10자가 시각이라 사전순이 곧 시간순이고, 뒤 16자가 난수라
 * 같은 밀리초에 두 프로세스가 만들어도 겹치지 않는다.
 */
export function ulid(at: number = Date.now()): string {
  return encodeTime(at, 10) + encodeRandom(16);
}

/** `<actor>-<ULID>`. 파일명이 되므로 actor 의 문자 제한이 그대로 적용된다. */
export function sessionId(actor: string, at: number = Date.now()): string {
  return `${actor}-${ulid(at)}`;
}

/** 라운지가 쓰는 시각 표기. 오프셋을 붙인다 — UTC 로 저장하면 사람이 못 읽는다. */
export function nowIso(at: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const offset = -at.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return (
    `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}` +
    `T${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}
