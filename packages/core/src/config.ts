/**
 * config.json — 표시용 이름과 한도값.
 * `project` 는 표시용일 뿐이고 라운지 신원은 폴더 위치가 결정한다.
 */
import { z } from 'zod';
import { LIMITS } from './types.js';

export const ConfigSchema = z.object({
  project: z.string().min(1),
  briefing: z
    .object({
      maxUnread: z.number().int().positive().default(LIMITS.maxUnread),
      aboutMaxLength: z.number().int().positive().default(LIMITS.aboutMaxLength),
      titleMaxLength: z.number().int().positive().default(LIMITS.titleMaxLength),
    })
    .default({}),
  sweep: z
    .object({
      idleMinutes: z.number().int().positive().default(LIMITS.idleMinutes),
    })
    .default({}),
  archive: z
    .object({
      afterResolvedDays: z.number().int().positive().default(LIMITS.archiveAfterResolvedDays),
    })
    .default({}),
});

export type Config = z.infer<typeof ConfigSchema>;

/** 파일이 비어 있거나 일부 키만 있어도 LIMITS 기본값으로 채운다. */
export function parseConfig(raw: unknown, fallbackProject: string): Config {
  const seed = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return ConfigSchema.parse({ project: fallbackProject, ...seed });
}
