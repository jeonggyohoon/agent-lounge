import { ACK_STATE_META } from '@lounge/core';
import type { EntryView } from '../lib/snapshot.js';
import { clockOf, dayOf } from '../lib/time.js';

/**
 * 항목 상세.
 *
 * 오른쪽에서 밀려 나온다. 좌우 2단으로 나누지 않는다 —
 * 상세는 판단 후의 행동이라 평소에는 화면에 없어야 한다.
 */
export function EntryDetail({ view, onClose }: { view: EntryView; onClose: () => void }) {
  const { entry, body, acks, staleRefs, label, tone } = view;
  const day = dayOf(entry.at);

  return (
    <aside className="detail" aria-label="항목 상세">
      <header className="detail__head">
        <span className={`detail__state detail__state--${tone}`}>{label}</span>
        <button type="button" className="detail__close" onClick={onClose}>
          닫기
        </button>
      </header>

      <h2 className="detail__title">{entry.title}</h2>
      <p className="detail__about">{entry.about}</p>

      <dl className="detail__facts">
        <Fact term="작성">{`${entry.by} · ${day ? `${day} ` : ''}${clockOf(entry.at)}`}</Fact>
        <Fact term="영역">{entry.area}</Fact>
        <Fact term="대상">{entry.to.length > 0 ? entry.to.join(', ') : '전체'}</Fact>
        <Fact term="아이디" mono>
          {entry.id}
        </Fact>
        {entry.supersedes && (
          <Fact term="대체" mono>
            {entry.supersedes}
          </Fact>
        )}
        {entry.reply_to && (
          <Fact term="응답" mono>
            {entry.reply_to}
          </Fact>
        )}
      </dl>

      {entry.refs.length > 0 && (
        <section className="detail__section">
          <h3 className="detail__heading">참조</h3>
          {entry.refs.map((ref) => {
            const stale = staleRefs?.includes(ref.path) ?? false;
            return (
              <p key={ref.path} className="detail__ref">
                <span className="mono">{ref.path}</span>
                {stale && <span className="detail__badge">바뀜</span>}
              </p>
            );
          })}
          {staleRefs === null && <p className="detail__note">지문을 계산하지 못했습니다</p>}
        </section>
      )}

      {acks.length > 0 && (
        <section className="detail__section">
          <h3 className="detail__heading">응답</h3>
          {acks.map((ack) => {
            const meta = ack.state ? ACK_STATE_META[ack.state] : null;
            return (
              <p key={ack.actor} className="detail__ack">
                <span className="detail__ack-actor">{ack.actor}</span>
                {meta && (
                  <span className={`detail__state detail__state--${meta.tone}`}>{meta.label}</span>
                )}
                {ack.note && <span className="detail__ack-note">{ack.note}</span>}
              </p>
            );
          })}
        </section>
      )}

      <section className="detail__section">
        <h3 className="detail__heading">본문</h3>
        <pre className="detail__body">{body}</pre>
      </section>
    </aside>
  );
}

function Fact({
  term,
  mono,
  children,
}: {
  term: string;
  mono?: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt className="detail__term">{term}</dt>
      <dd className={mono ? 'detail__value mono' : 'detail__value'}>{children}</dd>
    </>
  );
}
