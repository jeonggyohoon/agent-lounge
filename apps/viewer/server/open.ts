/**
 * 브라우저 열기.
 *
 * 실패해도 서버는 계속 돈다. 주소를 이미 출력했으므로 사람이 직접 열면 된다 —
 * 브라우저를 못 띄웠다고 뷰어를 내리는 것은 과한 반응이다.
 */
import { spawn } from 'node:child_process';

/** 플랫폼별 여는 명령. 없는 플랫폼이면 `null`. */
function opener(url: string): { command: string; args: string[] } | null {
  switch (process.platform) {
    case 'win32':
      // 첫 인자는 창 제목 자리다. 비워두지 않으면 URL 이 제목으로 먹힌다.
      return { command: 'cmd', args: ['/c', 'start', '', url] };
    case 'darwin':
      return { command: 'open', args: [url] };
    case 'linux':
      return { command: 'xdg-open', args: [url] };
    default:
      return null;
  }
}

/** 열렸는지 여부를 돌려준다. 던지지 않는다. */
export function openBrowser(url: string): boolean {
  const target = opener(url);
  if (!target) return false;
  try {
    const child = spawn(target.command, target.args, {
      stdio: 'ignore',
      // 브라우저가 살아 있는 동안 이 프로세스가 붙잡히지 않게 한다
      detached: true,
    });
    child.on('error', () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}
