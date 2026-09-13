/**
 * 설치와 초기화.
 *
 * P3 완료 조건은 "세 클라이언트에서 같은 라운지에 들어간다"와
 * "설치가 config 한 줄로 끝난다"이다. 매니페스트가 깨져 있으면 둘 다 못 한다.
 */
import { readFileSync } from 'node:fs';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join as joinNative, resolve } from 'node:path';
import { ABOUT_RULE, ConfigSchema, LIMITS, containsRule } from '@lounge/core';
import { discoverLounge } from '@lounge/core/fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { init } from '../src/init.js';
import { sessionId } from '../src/session.js';
import { configJson, loungeMd } from '../src/template.js';
import { join, post } from '../src/tools.js';

const repoRoot = resolve(import.meta.dirname, '../../..');
const readJson = (relative: string): Record<string, unknown> =>
  JSON.parse(readFileSync(joinNative(repoRoot, relative), 'utf8'));

let project: string;

beforeEach(async () => {
  project = await mkdtemp(resolve(tmpdir(), 'lounge-init-'));
});

afterEach(async () => {
  await rm(project, { recursive: true, force: true });
});

describe('--init', () => {
  it('라운지를 놓는다', async () => {
    const result = await init(project, '새프로젝트');
    expect(result.existed).toBe(false);
    expect(result.created).toEqual(['config.json', 'LOUNGE.md', '.gitignore']);

    const inside = await readdir(result.loungeDir);
    for (const name of ['entries', 'acks', 'archive', 'sessions', 'watermarks', 'resume']) {
      expect(inside, `${name} 이 없습니다`).toContain(name);
    }
  });

  it('이미 있으면 덮어쓰지 않는다', async () => {
    await init(project, '처음');
    const again = await init(project, '나중');
    expect(again.existed).toBe(true);
    expect(again.created).toEqual([]);

    const config = ConfigSchema.parse(
      JSON.parse(readFileSync(joinNative(again.loungeDir, 'config.json'), 'utf8')),
    );
    expect(config.project).toBe('처음');
  });

  it('프로젝트가 소유한 파일은 건드리지 않는다', async () => {
    await init(project, 'x');
    // .lounge 말고는 아무것도 생기지 않아야 한다
    expect(await readdir(project)).toEqual(['.lounge']);
  });

  it('폴더 이름을 기본 프로젝트명으로 쓴다', async () => {
    const result = await init(project);
    const config = ConfigSchema.parse(
      JSON.parse(readFileSync(joinNative(result.loungeDir, 'config.json'), 'utf8')),
    );
    expect(config.project).toBe(project.split(/[\\/]/).pop());
  });

  it('놓자마자 탐색되고 도구가 돈다', async () => {
    await init(project, '온보딩');
    const lounge = await discoverLounge(project);
    const actor = 'claude-code';
    const ctx = {
      lounge,
      actor,
      client: 'claude-code',
      sessionId: sessionId(actor),
      cwd: project,
      now: () => new Date(),
    };

    const first = await join(ctx);
    expect(first.text).toContain('온보딩 라운지');
    expect(first.text).toContain('미확인 없음');

    await post(ctx, {
      area: 'setup',
      title: '라운지를 붙였다',
      about: '이 프로젝트에 라운지를 놓았고 다른 클라이언트도 같은 폴더에 붙으면 된다',
      body: '본문',
    });
    expect((await join(ctx)).text).toContain('미확인 1건');
  });
});

describe('템플릿', () => {
  const generated = loungeMd('시험');

  it('LOUNGE.md 가 core 의 about 규칙을 글자 그대로 싣는다', () => {
    // 저장소의 .lounge/LOUNGE.md 와 SKILL.md 에 이어 세 번째 사본이다.
    // 손으로 복제하면 반드시 갈리므로 rules.ts 에서 가져와 심는다.
    expect(containsRule(generated, ABOUT_RULE)).toBe(true);
  });

  it('LOUNGE.md 가 한도값을 core 에서 가져온다', () => {
    expect(generated).toContain(`${LIMITS.aboutMaxLength}자를 넘으면`);
  });

  it('config.json 이 계약을 통과한다', () => {
    const config = ConfigSchema.parse(JSON.parse(configJson('시험')));
    expect(config.briefing.maxUnread).toBe(LIMITS.maxUnread);
    expect(config.sweep.idleMinutes).toBe(LIMITS.idleMinutes);
  });
});

describe('요건', () => {
  /**
   * `engines` 가 없으면 Node 18 로도 install 이 통과하고 build 에서야 깨진다.
   * 하한의 근거는 `import.meta.dirname` 이고 Node 20.11 에서 들어왔다.
   */
  it('루트가 Node 하한을 선언한다', () => {
    const root = readJson('package.json') as { engines?: { node?: string } };
    expect(root.engines?.node).toBe('>=20.11');
  });

  it('문서가 같은 하한을 말한다', () => {
    const install = readFileSync(joinNative(repoRoot, 'docs/INSTALL.md'), 'utf8');
    expect(install).toContain('20.11');
  });
});

describe('매니페스트', () => {
  it('플러그인 매니페스트가 MCP 서버를 인라인으로 선언한다', () => {
    const plugin = readJson('.claude-plugin/plugin.json') as {
      name: string;
      version: string;
      mcpServers: Record<string, { command: string; args: string[] }>;
    };
    expect(plugin.name).toBe('lounge');
    expect(plugin.version).toMatch(/^\d+\.\d+\.\d+$/);

    const server = plugin.mcpServers.lounge!;
    expect(server.command).toBe('node');
    expect(server.args[0]).toContain('${CLAUDE_PLUGIN_ROOT}');
    expect(server.args).toContain('--actor');
  });

  /**
   * 루트에 `.mcp.json` 을 두면 플러그인 매니페스트와 프로젝트 설정으로
   * 이중 로드되고, 프로젝트 쪽에서는 `${CLAUDE_PLUGIN_ROOT}` 가 정의되지
   * 않아 서버가 뜨지 않는다. 선언은 plugin.json 안에만 둔다.
   */
  it('저장소 루트에 .mcp.json 을 두지 않는다', () => {
    expect(() => readJson('.mcp.json')).toThrow();
  });

  it('훅이 라운지 파일을 직접 건드리지 않는다', () => {
    const hooks = readJson('hooks/hooks.json') as {
      hooks: Record<string, { hooks: { type: string; prompt?: string }[] }[]>;
    };
    expect(Object.keys(hooks.hooks).sort()).toEqual(['SessionStart', 'Stop']);
    for (const blocks of Object.values(hooks.hooks)) {
      for (const block of blocks) {
        for (const hook of block.hooks) {
          // 훅은 모델에게 지시만 한다. 명령을 돌려 파일을 만들지 않는다.
          expect(hook.type).toBe('prompt');
          expect(hook.prompt).toBeTruthy();
        }
      }
    }
  });

  it('클라이언트 설정 예시가 전부 유효하고 actor 를 넘긴다', () => {
    for (const relative of ['templates/.mcp.json', 'templates/claude-desktop.json']) {
      const config = readJson(relative) as {
        mcpServers: Record<string, { args: string[] }>;
      };
      expect(config.mcpServers.lounge!.args, relative).toContain('--actor');
    }

    // Claude Desktop 은 작업 디렉터리가 없어 --cwd 가 없으면 못 찾는다
    const desktop = readJson('templates/claude-desktop.json') as {
      mcpServers: Record<string, { args: string[] }>;
    };
    expect(desktop.mcpServers.lounge!.args).toContain('--cwd');

    const codex = readFileSync(joinNative(repoRoot, 'templates/codex-config.toml'), 'utf8');
    expect(codex).toContain('[mcp_servers.lounge]');
    expect(codex).toContain('--actor');
  });

  it('세 클라이언트가 서로 다른 actor 를 쓴다', () => {
    const actorOf = (args: string[]) => args[args.indexOf('--actor') + 1];
    const plugin = readJson('.claude-plugin/plugin.json') as {
      mcpServers: Record<string, { args: string[] }>;
    };
    const desktop = readJson('templates/claude-desktop.json') as {
      mcpServers: Record<string, { args: string[] }>;
    };
    const codex = readFileSync(joinNative(repoRoot, 'templates/codex-config.toml'), 'utf8');

    // 같은 actor 를 쓰면 읽음 기록이 섞이고 미확인 계산이 어긋난다
    const actors = [actorOf(plugin.mcpServers.lounge!.args), actorOf(desktop.mcpServers.lounge!.args)];
    expect(new Set(actors).size).toBe(2);
    expect(codex).toContain('"codex"');
  });
});
