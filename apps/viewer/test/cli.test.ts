/**
 * 프로젝트 폴더에서 뷰어를 띄우는 길.
 *
 * 여기서 한 번 깨진 적이 있다 — `server/index.ts` 의 자체 실행 블록이 cli
 * 번들에 섞여 들어가 진입점 판별이 같이 참이 되면서 포트를 두 번 잡았다.
 * 그래서 번들이 아니라 **실제 프로세스**로도 확인한다.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { noLoungeMessage, parseArgv } from '../server/cli.js';
import { listenOnFreePort, PREFERRED_PORTS } from '../server/port.js';

const appRoot = resolve(import.meta.dirname, '..');
const bundle = resolve(appRoot, 'dist/cli.js');

let project: string;
let bare: string;

/** 띄운 자식들. Windows 는 실행 중인 프로세스의 cwd 를 잠그므로 끝까지 기다린다. */
const children = new Set<ChildProcessWithoutNullStreams>();

function track(child: ChildProcessWithoutNullStreams): ChildProcessWithoutNullStreams {
  children.add(child);
  child.on('close', () => children.delete(child));
  return child;
}

async function waitForExit(): Promise<void> {
  await Promise.all(
    [...children].map(
      (child) =>
        new Promise<void>((done) => {
          child.on('close', () => done());
          child.kill();
        }),
    ),
  );
}

/** CLI 를 띄우고 첫 출력을 받아온다. 살아 있으면 배너를 읽고 끈다. */
function launch(cwd: string, args: string[] = []): Promise<{ code: number | null; out: string }> {
  return new Promise((done) => {
    const child = track(spawn(process.execPath, [bundle, '--no-open', ...args], { cwd }));
    let out = '';
    const collect = (chunk: Buffer) => {
      out += chunk.toString();
      // 배너를 다 받았으면 더 기다릴 이유가 없다
      if (out.includes('열림')) child.kill();
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('close', (code) => done({ code, out }));
  });
}

/** 배너만 받고 **죽이지 않는다.** 둘을 동시에 살려두고 비교할 때 쓴다. */
function spawnAlive(cwd: string): { child: ChildProcessWithoutNullStreams; banner: Promise<string> } {
  const child = track(spawn(process.execPath, [bundle, '--no-open'], { cwd }));
  const banner = new Promise<string>((done, fail) => {
    let out = '';
    child.stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString();
      if (out.includes('열림')) done(out);
    });
    child.on('close', () => fail(new Error(`배너를 못 받고 끝났습니다:\n${out}`)));
  });
  return { child, banner };
}

beforeAll(async () => {
  project = await mkdtemp(resolve(tmpdir(), 'lounge-cli-'));
  await mkdir(resolve(project, '.lounge/entries'), { recursive: true });
  await mkdir(resolve(project, 'packages/core/src'), { recursive: true });
  await writeFile(resolve(project, '.lounge/config.json'), '{"project":"시디아이"}');

  bare = await mkdtemp(resolve(tmpdir(), 'lounge-cli-bare-'));
});

afterAll(async () => {
  await waitForExit();
  const wipe = { recursive: true, force: true, maxRetries: 10, retryDelay: 50 };
  await rm(project, wipe);
  await rm(bare, wipe);
});

describe('인자', () => {
  it('기본값은 현재 폴더를 열고 브라우저를 띄운다', () => {
    const options = parseArgv([], '/somewhere');
    expect(options.open).toBe(true);
    expect(options.port).toBeNull();
  });

  it('--no-open 과 --port 를 받는다', () => {
    const options = parseArgv(['--no-open', '--port', '6000'], '/somewhere');
    expect(options.open).toBe(false);
    expect(options.port).toBe(6000);
  });

  it('--cwd 가 현재 폴더를 이긴다', () => {
    expect(parseArgv(['--cwd', '/elsewhere'], '/somewhere').cwd).toBe(resolve('/elsewhere'));
  });
});

describe('포트', () => {
  const opened: Server[] = [];
  const open = () => {
    const server = createServer();
    opened.push(server);
    return server;
  };

  afterAll(() => {
    for (const server of opened) server.close();
  });

  it('물려 있으면 다음 후보로 넘어간다', async () => {
    const first = await listenOnFreePort(open(), '127.0.0.1');
    const second = await listenOnFreePort(open(), '127.0.0.1');
    expect(second).not.toBe(first);
    expect(PREFERRED_PORTS).toContain(first);
  });

  it('후보가 전부 막혀도 OS 에게 받아 연다', async () => {
    // 후보를 일부러 하나만 주고 그것을 미리 물린다
    const taken = await listenOnFreePort(open(), '127.0.0.1');
    const port = await listenOnFreePort(open(), '127.0.0.1', [taken]);
    expect(port).toBeGreaterThan(0);
    expect(port).not.toBe(taken);
  });
});

describe('안내', () => {
  it('라운지가 없으면 --init 명령을 알려준다', () => {
    const message = noLoungeMessage('/work/myapp');
    expect(message).toContain('찾지 못했습니다');
    expect(message).toContain('--init');
    // 뷰어는 만들지 않는다. 만드는 길을 알려줄 뿐이다.
    expect(message).toContain('만들지 않습니다');
  });
});

describe.runIf(existsSync(bundle))('번들 (dist/cli.js)', () => {
  it('하위 폴더에서 실행해도 위로 올라가 찾는다', async () => {
    const { out } = await launch(resolve(project, 'packages/core/src'));
    expect(out).toContain('.lounge');
    expect(out).toContain('시디아이');
    expect(out).toMatch(/열림\s+http:\/\/127\.0\.0\.1:\d+/);
  });

  it('어느 라운지를 열었는지 경로를 출력한다', async () => {
    const { out } = await launch(project);
    expect(out).toContain(resolve(project, '.lounge'));
  });

  it('라운지가 없으면 만들지 않고 종료한다', async () => {
    const { code, out } = await launch(bare);
    expect(code).toBe(3);
    expect(out).toContain('--init');
    // 조용히 만들지 않았는지 확인한다
    expect(existsSync(resolve(bare, '.lounge'))).toBe(false);
  });

  it('프로젝트를 둘 동시에 띄워도 포트가 겹치지 않는다', async () => {
    // 배너를 보고 바로 죽이면 포트가 풀려서 두 번째가 같은 자리를 잡는다.
    // 그건 동시가 아니다 — 둘 다 살아 있는 채로 비교해야 한다.
    const first = spawnAlive(project);
    const second = spawnAlive(project);
    try {
      const [a, b] = await Promise.all([first.banner, second.banner]);
      const portOf = (out: string) => out.match(/127\.0\.0\.1:(\d+)/)?.[1];
      expect(portOf(a)).toBeTruthy();
      expect(portOf(b)).toBeTruthy();
      expect(portOf(a)).not.toBe(portOf(b));
    } finally {
      first.child.kill();
      second.child.kill();
    }
  });
});
