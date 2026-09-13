import type { AckState, EntryState, SessionState } from "./types.js";

export const TONES = ["live", "signal", "alert", "muted"] as const;
export type Tone = (typeof TONES)[number];

/**
 * 글자에 쓰이는 색은 `card` 와 `paper` 양쪽에서 **4.5:1 이상**이어야 한다.
 * 상태 라벨은 12px 라 조금만 흐려도 못 읽는다. `test/contrast.test.ts` 가 잰다.
 *
 * 처음 고른 값은 화면에서 낮았다 — light 의 signal 이 3.05:1, live 가 3.42:1 로
 * 흰 카드 위에서 거의 보이지 않았다. 색조와 채도는 두고 명도만 내렸다.
 */
export const COLORS: Record<string, { light: string; dark: string }> = {
  ink: { light: "#16202B", dark: "#E4E8ED" },
  muted: { light: "#5B6B7A", dark: "#8C9AA8" },
  paper: { light: "#E9ECEF", dark: "#141A21" },
  card: { light: "#FFFFFF", dark: "#1C242E" },
  line: { light: "#D3D9DF", dark: "#2A3440" },
  live: { light: "#18775A", dark: "#3FBF95" },
  signal: { light: "#88620F", dark: "#E0A82E" },
  alert: { light: "#A8382E", dark: "#D96A60" },
};

export const SPACE = [4, 8, 12, 16, 24, 32] as const;
export const RADIUS = 6;

export const TYPE = {
  display: { size: 20, weight: 600 },
  title: { size: 15, weight: 600 },
  body: { size: 14, weight: 400 },
  meta: { size: 12, weight: 400 },
} as const;

export const ENTRY_STATE_META: Record<EntryState, { label: string; tone: Tone }> = {
  open: { label: "열림", tone: "signal" },
  resolved: { label: "종결", tone: "live" },
  superseded: { label: "대체됨", tone: "alert" },
  dropped: { label: "폐기", tone: "muted" },
};

export const ACK_STATE_META: Record<AckState, { label: string; tone: Tone }> = {
  applied: { label: "반영함", tone: "live" },
  skipped: { label: "해당 없음", tone: "muted" },
  blocked: { label: "대기 중", tone: "signal" },
};

export const SESSION_STATE_META: Record<SessionState, { label: string; tone: Tone }> = {
  active: { label: "접속 중", tone: "live" },
  left: { label: "나감", tone: "muted" },
  abandoned: { label: "비정상 종료", tone: "alert" },
};

export function cssVariables(mode: "light" | "dark"): string {
  const colors = Object.entries(COLORS)
    .map(([name, v]) => `  --c-${name}: ${v[mode]};`)
    .join("\n");
  const spaces = SPACE.map((n) => `  --s-${n}: ${n}px;`).join("\n");
  const types = Object.entries(TYPE)
    .map(([n, t]) => `  --t-${n}-size: ${t.size}px;\n  --t-${n}-weight: ${t.weight};`)
    .join("\n");
  return `:root {\n${colors}\n${spaces}\n${types}\n  --radius: ${RADIUS}px;\n}`;
}
