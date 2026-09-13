import { useState } from 'react';

/**
 * 빈 화면.
 *
 * **사과하지 않고 무엇을 하면 되는지 쓴다.**
 * "라운지를 만들기" 버튼은 두지 않는다 — 뷰어는 쓰지 않는다.
 *
 * 폴더는 경로를 받아 연다. 브라우저에는 폴더 대화상자가 없고, 있어도
 * 파일 내용만 줄 뿐 경로를 주지 않아 라운지를 찾을 수 없다.
 */
export function EmptyState({
  title,
  hint,
  submitLabel,
  onOpen,
  recents,
  onForget,
}: {
  title: string;
  hint?: string;
  submitLabel: string;
  onOpen: (path: string) => void;
  recents?: string[];
  onForget?: (path: string) => void;
}) {
  const [draft, setDraft] = useState('');

  return (
    <div className="empty">
      <p className="empty__title">{title}</p>
      {hint && <p className="empty__hint">{hint}</p>}

      <form
        className="empty__form"
        onSubmit={(event) => {
          event.preventDefault();
          onOpen(draft);
          setDraft('');
        }}
      >
        <input
          className="empty__input mono"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="D:\project\lounge"
          aria-label="프로젝트 폴더 경로"
          spellCheck={false}
        />
        <button type="submit" className="empty__action">
          {submitLabel}
        </button>
      </form>

      {recents && recents.length > 0 && (
        <div className="empty__recents">
          <p className="empty__heading">최근 연 프로젝트</p>
          {recents.map((path) => (
            <div key={path} className="empty__recent">
              <button
                type="button"
                className="empty__recent-open mono"
                onClick={() => onOpen(path)}
              >
                {path}
              </button>
              <button
                type="button"
                className="empty__recent-forget"
                onClick={() => onForget?.(path)}
                aria-label={`${path} 목록에서 지우기`}
              >
                지우기
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
