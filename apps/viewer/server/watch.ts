/**
 * `.lounge/` 감시.
 *
 * 백엔드가 `chokidar` 로 지켜보고, 바뀌면 붙어 있는 SSE 연결에 알린다.
 * 무엇이 바뀌었는지는 보내지 않는다 — 프런트는 통째로 다시 읽는다.
 * 항목 수백 개 규모에서 이게 부분 갱신보다 싸고, 화면이 파일과 어긋날 수 없다.
 */
import { findLoungeWith } from '@lounge/core';
import { nodeIO } from '@lounge/core/fs';
import chokidar, { type FSWatcher } from 'chokidar';

/** 파일 이벤트가 몰아칠 때 묶는 간격. 사람이 못 느끼는 선. */
const DEBOUNCE_MS = 80;

export interface Changes {
  loungeDir: string;
  /** 알림을 받는다. 돌려받은 함수를 부르면 그만 받는다. */
  subscribe(listener: () => void): () => void;
}

interface Entry {
  loungeDir: string;
  watcher: FSWatcher;
  listeners: Set<() => void>;
  timer: NodeJS.Timeout | null;
  /** chokidar 가 첫 훑기를 끝냈는가. 이 전에는 변경을 놓칠 수 있다. */
  ready: Promise<void>;
}

/** 라운지 폴더 하나당 감시자 하나. 창을 여러 개 열어도 감시자는 늘지 않는다. */
const open = new Map<string, Entry>();

/**
 * `projectDir` 에서 라운지를 찾아 감시를 시작한다.
 * 라운지가 없으면 `LoungeNotFoundError` 를 던진다 — 조용히 만들지 않는다.
 */
export async function openChanges(projectDir: string): Promise<Changes> {
  const loungeDir = await findLoungeWith(nodeIO, projectDir);
  const entry = open.get(loungeDir) ?? start(loungeDir);
  // 감시가 실제로 걸린 뒤에 돌려준다. 그 전에 "보고 있다"고 하면 거짓말이다.
  await entry.ready;

  return {
    loungeDir,
    subscribe(listener) {
      entry.listeners.add(listener);
      return () => {
        entry.listeners.delete(listener);
        if (entry.listeners.size === 0) stop(loungeDir);
      };
    },
  };
}

function start(loungeDir: string): Entry {
  const watcher = chokidar.watch(loungeDir, {
    ignoreInitial: true,
    // 원자적 쓰기의 임시 파일까지 알릴 필요는 없다
    ignored: (path) => path.endsWith('.tmp'),
  });

  const entry: Entry = {
    loungeDir,
    listeners: new Set(),
    timer: null,
    watcher,
    ready: new Promise((resolve) => watcher.once('ready', () => resolve())),
  };

  const fire = () => {
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      entry.timer = null;
      for (const listener of entry.listeners) listener();
    }, DEBOUNCE_MS);
  };

  entry.watcher.on('all', fire);
  // 감시가 죽어도 서버는 살아 있어야 한다. 화면이 안 갱신될 뿐이다.
  entry.watcher.on('error', () => {});

  open.set(loungeDir, entry);
  return entry;
}

function stop(loungeDir: string): void {
  const entry = open.get(loungeDir);
  if (!entry) return;
  if (entry.timer) clearTimeout(entry.timer);
  void entry.watcher.close();
  open.delete(loungeDir);
}

/** 서버를 끄기 전에 감시자를 전부 닫는다. 테스트가 매달리지 않게 한다. */
export async function closeAllChanges(): Promise<void> {
  const entries = [...open.values()];
  open.clear();
  await Promise.all(
    entries.map((entry) => {
      if (entry.timer) clearTimeout(entry.timer);
      return entry.watcher.close();
    }),
  );
}
