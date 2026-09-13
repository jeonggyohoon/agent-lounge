import { z } from "zod";

export const ENTRY_STATES = ["open", "resolved", "superseded", "dropped"] as const;
export const ACK_STATES = ["applied", "skipped", "blocked"] as const;
export const SESSION_STATES = ["active", "left", "abandoned"] as const;

export type EntryState = (typeof ENTRY_STATES)[number];
export type AckState = (typeof ACK_STATES)[number];
export type SessionState = (typeof SESSION_STATES)[number];

export const LIMITS = {
  aboutMaxLength: 120,
  titleMaxLength: 60,
  maxUnread: 5,
  idleMinutes: 30,
  archiveAfterResolvedDays: 7,
} as const;

export const ACTOR_RE = /^[a-z0-9][a-z0-9-]*(@[a-z0-9][a-z0-9-]*)?$/;
export const ENTRY_ID_RE = /^\d{8}-\d{4}-[a-z0-9@-]+(-\d+)?$/;

export const RefSchema = z.object({
  path: z.string().min(1),
  sha: z.string().optional(),
});

export const EntrySchema = z.object({
  id: z.string().regex(ENTRY_ID_RE),
  by: z.string().regex(ACTOR_RE),
  at: z.string().datetime({ offset: true }),
  area: z.string().min(1),
  title: z.string().min(1).max(LIMITS.titleMaxLength),
  about: z.string().min(1).max(LIMITS.aboutMaxLength),
  to: z.array(z.string().regex(ACTOR_RE)).default([]),
  state: z.enum(ENTRY_STATES).default("open"),
  refs: z.array(RefSchema).default([]),
  supersedes: z.string().regex(ENTRY_ID_RE).nullable().default(null),
  reply_to: z.string().regex(ENTRY_ID_RE).nullable().default(null),
});

export const AckSchema = z
  .object({
    entry: z.string().regex(ENTRY_ID_RE),
    actor: z.string().regex(ACTOR_RE),
    state: z.enum(ACK_STATES).optional(),
    at: z.string().datetime({ offset: true }).optional(),
    opened_at: z.string().datetime({ offset: true }).optional(),
    note: z.string().optional(),
    evidence: z
      .object({ commit: z.string().optional(), files: z.array(z.string()).default([]) })
      .optional(),
    waiting_on: z.string().nullable().default(null),
  })
  .refine((a) => a.state !== "blocked" || !!a.waiting_on, {
    message: "blocked 상태에는 waiting_on 이 필요합니다",
    path: ["waiting_on"],
  });

export const SessionSchema = z.object({
  id: z.string().min(1),
  actor: z.string().regex(ACTOR_RE),
  client: z.string().min(1),
  cwd: z.string().min(1),
  joined_at: z.string().datetime({ offset: true }),
  last_seen: z.string().datetime({ offset: true }),
  state: z.enum(SESSION_STATES).default("active"),
  left_at: z.string().datetime({ offset: true }).nullable().default(null),
});

export const WatermarkSchema = z.object({
  actor: z.string().regex(ACTOR_RE),
  since: z.string().datetime({ offset: true }),
});

export type Entry = z.infer<typeof EntrySchema>;
export type Ack = z.infer<typeof AckSchema>;
export type Session = z.infer<typeof SessionSchema>;
export type Watermark = z.infer<typeof WatermarkSchema>;

export const PATHS = {
  root: ".lounge",
  config: "config.json",
  entry: (id: string) => `entries/${id}.md`,
  ackDir: (id: string) => `acks/${id}`,
  ack: (id: string, actor: string) => `acks/${id}/${actor}.json`,
  session: (id: string) => `sessions/${id}.json`,
  watermark: (actor: string) => `watermarks/${actor}.json`,
  resume: (actor: string) => `resume/${actor}.md`,
  archive: (yyyymm: string, id: string) => `archive/${yyyymm}/${id}.md`,
} as const;

export function entryId(at: Date, actor: string, seq = 1): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const d = `${at.getFullYear()}${p(at.getMonth() + 1)}${p(at.getDate())}`;
  const t = `${p(at.getHours())}${p(at.getMinutes())}`;
  return seq > 1 ? `${d}-${t}-${actor}-${seq}` : `${d}-${t}-${actor}`;
}
