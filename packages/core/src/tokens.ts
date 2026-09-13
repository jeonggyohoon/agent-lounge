import type { AckState, EntryState, SessionState } from "./types.js";

export const TONES = ["live", "signal", "alert", "muted"] as const;
export type Tone = (typeof TONES)[number];

export const COLORS: Record<string, { light: string; dark: string }> = {
  ink: { light: "#16202B", dark: "#E4E8ED" },
  muted: { light: "#5E6E7E", dark: "#8C9AA8" },
  paper: { light: "#E9ECEF", dark: "#141A21" },
  card: { light: "#FFFFFF", dark: "#1C242E" },
  line: { light: "#D3D9DF", dark: "#2A3440" },
  live: { light: "#1F9D76", dark: "#3FBF95" },
  signal: { light: "#C08A15", dark: "#E0A82E" },
  alert: { light: "#A8382E", dark: "#D4564A" },
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
