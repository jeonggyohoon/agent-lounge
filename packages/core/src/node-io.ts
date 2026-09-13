/**
 * node 어댑터.
 *
 * `LoungeWriteIO` 를 `node:fs` 로 구현한다. 라운지 규칙은 하나도 들어 있지
 * 않다 — 여기 있는 것은 전부 플랫폼 호출뿐이다.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { LoungeWriteIO } from './io.js';

function isMissing(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

export const nodeIO: LoungeWriteIO = {
  async readText(path) {
    try {
      return await readFile(path, 'utf8');
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  },

  async readBytes(path) {
    try {
      return new Uint8Array(await readFile(path));
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  },

  async listDir(path) {
    try {
      return await readdir(path);
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
  },

  async exists(path) {
    try {
      await stat(path);
      return true;
    } catch {
      return false;
    }
  },

  async isDirectory(path) {
    try {
      return (await stat(path)).isDirectory();
    } catch {
      return false;
    }
  },

  async realpath(path) {
    return realpath(path);
  },

  async sha1(bytes) {
    return createHash('sha1').update(bytes).digest('hex');
  },

  async sha256(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
  },

  async writeText(path, data) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data, 'utf8');
  },

  async mkdirp(path) {
    await mkdir(path, { recursive: true });
  },

  async rename(from, to) {
    await rename(from, to);
  },

  async remove(path) {
    await rm(path, { force: true });
  },
};
