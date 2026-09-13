import { describe, expect, it } from 'vitest';
import { FrontmatterError, parseFrontmatter, stringifyFrontmatter } from '../src/frontmatter.js';

describe('frontmatter', () => {
  it('머리말과 본문을 나눈다', () => {
    const doc = parseFrontmatter('---\nid: a\nto: [x]\n---\n\n본문 첫 줄\n');
    expect(doc.data).toEqual({ id: 'a', to: ['x'] });
    expect(doc.body).toBe('본문 첫 줄');
  });

  it('CRLF 와 BOM 을 허용한다', () => {
    const doc = parseFrontmatter('﻿---\r\nid: a\r\n---\r\n\r\n본문\r\n');
    expect(doc.data).toEqual({ id: 'a' });
  });

  it('본문이 없어도 된다', () => {
    expect(parseFrontmatter('---\nid: a\n---\n').body).toBe('');
  });

  it('펜스가 없으면 거부한다', () => {
    expect(() => parseFrontmatter('그냥 마크다운\n')).toThrow(FrontmatterError);
  });

  it('머리말이 매핑이 아니면 거부한다', () => {
    expect(() => parseFrontmatter('---\n- a\n- b\n---\n')).toThrow(FrontmatterError);
  });

  it('왕복해도 값이 유지된다', () => {
    const data = { id: '20260913-1015-codex', to: ['claude-code@auth'], supersedes: null };
    const round = parseFrontmatter(stringifyFrontmatter(data, '본문'));
    expect(round.data).toEqual(data);
    expect(round.body).toBe('본문');
  });

  it('줄바꿈을 LF 로 고정한다', () => {
    expect(stringifyFrontmatter({ id: 'a' }, '한 줄\r\n두 줄')).not.toContain('\r');
  });
});
