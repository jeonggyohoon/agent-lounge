/**
 * 실제로 프로세스를 띄워서 확인한다.
 *
 * T14 와 T15 는 진입점의 동작이라 함수 호출로는 확인이 안 된다 —
 * 어느 폴더에서 실행했느냐가 전부이기 때문이다.
 * 겸해서 MCP 클라이언트를 붙여 도구가 프로토콜 위에서 도는지도 본다.
 */
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const packageRoot = resolve(import.meta.dirname, '..');
const entry = resolve(packageRoot, 'src/index.ts');

let root: string;
let deep: string;

/** 서버를 띄웠다가 끄고 stderr 와 종료 코드를 돌려준다. */
function run(args: string[]): Promise<{ code: number | null; stderr: string }> {
  return new Promise((done) => {
    const child = spawn('pnpm', ['exec', 'tsx', entry, ...args], {
      cwd: packageRoot,
      shell: process.platform === 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
      // 정상 기동은 라운지 경로를 알린다. 확인했으면 끈다.
      if (stderr.includes('세션 ')) child.kill();
    });
    child.on('close', (code) => done({ code, stderr }));
  });
}

beforeAll(async () => {
  root = await mkdtemp(resolve(tmpdir(), 'lounge-stdio-'));
  deep = resolve(root, 'packages/core/src');
  await mkdir(deep, { recursive: true });
  await mkdir(resolve(root, '.lounge/entries'), { recursive: true });
  await writeFile(resolve(root, '.lounge/config.json'), '{"project":"stdio시험"}');
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('검수표 (프로세스)', () => {
  it('T14 — 하위 폴더에서 실행해도 같은 라운지에 붙는다', async () => {
    const top = await run(['--actor', 'codex', '--cwd', root]);
    const nested = await run(['--actor', 'codex', '--cwd', deep]);

    const loungeOf = (stderr: string) => stderr.split('\n')[0]!.replace('라운지 ', '').trim();
    expect(loungeOf(nested.stderr)).toBe(loungeOf(top.stderr));
    expect(loungeOf(nested.stderr)).toMatch(/[\\/]\.lounge$/);
  });

  it('T15 — 라운지 없는 폴더에서는 실패한다. 조용히 만들지 않는다', async () => {
    const bare = await mkdtemp(resolve(tmpdir(), 'lounge-bare-'));
    const result = await run(['--actor', 'codex', '--cwd', bare]);

    expect(result.code).toBe(3);
    expect(result.stderr).toContain('찾지 못했습니다');

    const { readdir } = await import('node:fs/promises');
    expect(await readdir(bare)).toEqual([]);
    await rm(bare, { recursive: true, force: true });
  });

  it('--actor 가 없으면 시작하지 않는다', async () => {
    const result = await run(['--cwd', root]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('actor 를 지정해야 합니다');
  });

  it('--actor 형식이 어긋나면 시작하지 않는다', async () => {
    const result = await run(['--actor', 'Claude Code', '--cwd', root]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('쓸 수 없습니다');
  });
});

describe('MCP 프로토콜', () => {
  it('도구 6개를 알리고 join 이 브리핑을 돌려준다', async () => {
    const transport = new StdioClientTransport({
      command: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
      args: ['exec', 'tsx', entry, '--actor', 'codex', '--cwd', root],
      cwd: packageRoot,
    });
    const client = new Client({ name: 'checklist', version: '0' });
    await client.connect(transport);

    try {
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name).sort()).toEqual([
        'lounge_ack',
        'lounge_digest',
        'lounge_join',
        'lounge_leave',
        'lounge_open',
        'lounge_post',
      ]);

      const joined = await client.callTool({ name: 'lounge_join', arguments: {} });
      const first = (joined.content as { type: string; text: string }[])[0]!;
      expect(first.text).toContain('stdio시험 라운지');

      // 계약 위반은 프로토콜 위에서도 거부된다
      const rejected = await client.callTool({
        name: 'lounge_post',
        arguments: { area: 'a', title: 't', about: '가'.repeat(130), body: 'b' },
      });
      expect(rejected.isError).toBe(true);
    } finally {
      await client.close();
    }
  });
});
