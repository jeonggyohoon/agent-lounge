/**
 * 개발용 백엔드 실행기.
 *
 * `vite dev` 가 화면을 맡을 때 API 와 감시만 따로 띄운다.
 * **최상위 부작용은 여기에만 둔다** — 이 파일은 번들에 들어가지 않는다.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createViewerServer, HOST } from './index.js';
import { closeAllChanges } from './watch.js';

const DEFAULT_PORT = 5174;

/** `--project <경로>` 또는 첫 번째 인자. 없으면 현재 폴더. */
function projectFromArgv(argv: string[]): string {
  const flag = argv.indexOf('--project');
  if (flag !== -1 && argv[flag + 1]) return resolve(argv[flag + 1]!);
  const first = argv.find((a) => !a.startsWith('-'));
  return resolve(first ?? process.cwd());
}

const defaultProject = projectFromArgv(process.argv.slice(2));
const web = resolve(import.meta.dirname, '../dist/web');
const port = Number(process.env.LOUNGE_VIEWER_PORT ?? DEFAULT_PORT);

const server = createViewerServer({
  defaultProject,
  ...(existsSync(web) ? { staticDir: web } : {}),
});

server.listen(port, HOST, () => {
  console.log(`라운지 뷰어 백엔드 http://${HOST}:${port}`);
  console.log(`기본 프로젝트 ${defaultProject}`);
});

const shutdown = () => {
  server.close();
  void closeAllChanges().then(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
