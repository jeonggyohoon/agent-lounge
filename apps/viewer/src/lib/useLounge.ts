/**
 * 화면 상태와 변경 구독.
 *
 * 프런트엔드는 파일을 직접 읽지 않는다. 백엔드가 읽어 만든 스냅숏을 받고,
 * `.lounge/` 가 바뀌면 SSE 로 신호만 받아 다시 가져온다.
 * 폴링도 웹소켓도 없다 — 한 방향으로만 흐르므로 SSE 로 충분하다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Snapshot } from './snapshot.js';

/** 상대 시각("2분 전")을 다시 그리는 주기. */
const TICK_MS = 30_000;

/** SSE 가 끊겼을 때 다시 붙기까지. 브라우저 기본 재접속에 더해 둔 안전장치. */
const RECONNECT_MS = 3_000;

const RECENTS_KEY = 'lounge.viewer.recents';
const RECENTS_MAX = 8;

export type ViewState =
  | { kind: 'empty' }
  | { kind: 'loading'; projectDir: string }
  | { kind: 'no-lounge'; projectDir: string }
  | { kind: 'ready'; snapshot: Snapshot }
  | { kind: 'failed'; projectDir: string; message: string };

function readRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function saveRecents(list: string[]): void {
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(list.slice(0, RECENTS_MAX)));
  } catch {
    // 저장 못 해도 앱은 돈다. 최근 목록은 편의일 뿐이다.
  }
}

function apiUrl(path: string, projectDir: string): string {
  return `/api/${path}?project=${encodeURIComponent(projectDir)}`;
}

export function useLounge() {
  const [state, setState] = useState<ViewState>({ kind: 'empty' });
  const [recents, setRecents] = useState<string[]>(() => readRecents());
  const [tick, setTick] = useState(0);

  /** 지금 열려 있는 프로젝트 폴더. SSE 콜백이 참조한다. */
  const projectRef = useRef<string | null>(null);

  const load = useCallback(async (projectDir: string) => {
    try {
      const response = await fetch(apiUrl('snapshot', projectDir));
      if (response.status === 404) {
        setState({ kind: 'no-lounge', projectDir });
        return;
      }
      if (!response.ok) {
        const body: { message?: string } = await response.json().catch(() => ({}));
        setState({ kind: 'failed', projectDir, message: body.message ?? '읽지 못했습니다' });
        return;
      }
      setState({ kind: 'ready', snapshot: (await response.json()) as Snapshot });
    } catch (error) {
      setState({ kind: 'failed', projectDir, message: (error as Error).message });
    }
  }, []);

  const openProject = useCallback(
    (projectDir: string) => {
      const trimmed = projectDir.trim();
      if (!trimmed) return;
      projectRef.current = trimmed;
      setState({ kind: 'loading', projectDir: trimmed });
      setRecents((previous) => {
        const next = [trimmed, ...previous.filter((p) => p !== trimmed)].slice(0, RECENTS_MAX);
        saveRecents(next);
        return next;
      });
      void load(trimmed);
    },
    [load],
  );

  /** 프로젝트 고르는 화면으로 돌아간다. */
  const clearProject = useCallback(() => {
    projectRef.current = null;
    setState({ kind: 'empty' });
  }, []);

  const forget = useCallback((projectDir: string) => {
    setRecents((previous) => {
      const next = previous.filter((p) => p !== projectDir);
      saveRecents(next);
      return next;
    });
  }, []);

  // 백엔드가 들고 시작한 폴더를 첫 화면에 바로 띄운다
  useEffect(() => {
    let cancelled = false;
    void fetch('/api/default')
      .then((r) => (r.ok ? (r.json() as Promise<{ project?: string }>) : null))
      .then((body) => {
        if (!cancelled && body?.project) openProject(body.project);
      })
      .catch(() => {
        // 백엔드가 아직 안 떴을 수도 있다. 사용자가 직접 고르면 된다.
      });
    return () => {
      cancelled = true;
    };
  }, [openProject]);

  // 변경 구독. 라운지를 찾은 뒤에만 건다.
  const watching = state.kind === 'ready' ? state.snapshot.projectRoot : null;
  useEffect(() => {
    if (!watching) return;
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = () => {
      if (closed) return;
      source = new EventSource(apiUrl('events', watching));
      source.addEventListener('changed', () => {
        const dir = projectRef.current;
        if (dir) void load(dir);
      });
      source.onerror = () => {
        source?.close();
        source = null;
        retry = setTimeout(connect, RECONNECT_MS);
      };
    };
    connect();

    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      source?.close();
    };
  }, [watching, load]);

  // 상대 시각만 다시 그린다. 백엔드는 건드리지 않는다.
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  return { state, recents, tick, openProject, clearProject, forget };
}
