import { useState } from 'react';
import { EmptyState } from './components/EmptyState.js';
import { EntryDetail } from './components/EntryDetail.js';
import { PresencePanel } from './components/PresencePanel.js';
import { Timeline } from './components/Timeline.js';
import { useLounge } from './lib/useLounge.js';

export function App() {
  const { state, recents, tick, openProject, clearProject, forget } = useLounge();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (state.kind === 'empty' || state.kind === 'loading') {
    return (
      <Shell>
        <EmptyState
          title={state.kind === 'loading' ? '여는 중입니다' : '프로젝트 폴더를 연결하세요'}
          submitLabel="열기"
          onOpen={openProject}
          recents={recents}
          onForget={forget}
        />
      </Shell>
    );
  }

  if (state.kind === 'no-lounge') {
    return (
      <Shell>
        <EmptyState
          title="이 폴더에 라운지가 없습니다"
          hint={`${state.projectDir} 및 상위 경로에서 .lounge/ 를 찾지 못했습니다. 라운지는 MCP 도구가 만듭니다.`}
          submitLabel="다른 폴더 열기"
          onOpen={openProject}
          recents={recents}
          onForget={forget}
        />
      </Shell>
    );
  }

  if (state.kind === 'failed') {
    return (
      <Shell>
        <EmptyState
          title="라운지를 읽지 못했습니다"
          hint={state.message}
          submitLabel="다른 폴더 열기"
          onOpen={openProject}
          recents={recents}
          onForget={forget}
        />
      </Shell>
    );
  }

  const { snapshot } = state;
  const selected = snapshot.entries.find((e) => e.entry.id === selectedId) ?? null;

  return (
    <Shell>
      <header className="header">
        <span className="header__project">{snapshot.projectName}</span>
        <button
          type="button"
          className="header__path mono"
          onClick={clearProject}
          title="다른 폴더 열기"
        >
          {snapshot.projectRoot}
        </button>
      </header>

      <PresencePanel presence={snapshot.presence} tick={tick} />

      <main className="main">
        <Timeline
          entries={snapshot.entries}
          selectedId={selectedId}
          onSelect={(id) => setSelectedId((current) => (current === id ? null : id))}
        />
      </main>

      {selected && <EntryDetail view={selected} onClose={() => setSelectedId(null)} />}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="shell">{children}</div>;
}
