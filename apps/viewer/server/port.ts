/**
 * 빈 포트 고르기.
 *
 * 프로젝트를 여러 개 동시에 띄울 수 있어야 한다. 고정 포트를 쓰면 두 번째가
 * `EADDRINUSE` 로 죽는다.
 */
import type { Server } from 'node:http';

/** 처음에 훑어보는 범위. 여기서 잡히면 주소가 기억하기 쉬운 값이 된다. */
export const PREFERRED_PORTS = Array.from({ length: 26 }, (_, i) => 5174 + i);

export class PortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PortError';
  }
}

function tryListen(server: Server, port: number, host: string): Promise<number | null> {
  return new Promise((done, fail) => {
    const onError = (error: NodeJS.ErrnoException) => {
      server.removeListener('listening', onListening);
      // 이미 물려 있으면 다음 후보로. 그 밖의 오류는 삼키지 않는다.
      if (error.code === 'EADDRINUSE' || error.code === 'EACCES') done(null);
      else fail(error);
    };
    const onListening = () => {
      server.removeListener('error', onError);
      const address = server.address();
      done(typeof address === 'object' && address ? address.port : port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

/**
 * **딱 이 포트로만 연다.** 막혀 있으면 다른 데로 넘어가지 않고 실패한다.
 *
 * 사람이 `--port 6100` 이라고 했는데 6100 이 아닌 곳에 뜨면 놀란다.
 * 자동으로 찾기를 원하면 지정하지 않는 것이 그 뜻이다.
 */
export async function listenOnPort(server: Server, host: string, port: number): Promise<number> {
  const opened = await tryListen(server, port, host);
  if (opened !== null) return opened;
  throw new PortError(
    `포트 ${port} 이(가) 이미 사용 중입니다.\n` +
      '--port 를 빼면 빈 포트를 자동으로 찾습니다.',
  );
}

/**
 * `preferred` 를 순서대로 훑고, 전부 막혀 있으면 `0` 으로 OS 에게 받는다.
 * 0 까지 실패하는 경우는 포트가 아니라 다른 문제이므로 던진다.
 */
export async function listenOnFreePort(
  server: Server,
  host: string,
  preferred: readonly number[] = PREFERRED_PORTS,
): Promise<number> {
  for (const candidate of preferred) {
    const port = await tryListen(server, candidate, host);
    if (port !== null) return port;
  }

  const any = await tryListen(server, 0, host);
  if (any !== null) return any;
  throw new PortError(`${host} 에서 열 수 있는 포트를 찾지 못했습니다.`);
}
