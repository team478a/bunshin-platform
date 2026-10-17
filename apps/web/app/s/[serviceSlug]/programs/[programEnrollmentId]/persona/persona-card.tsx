'use client';

import { useState } from 'react';

type PersonaItem = {
  id: string;
  attributeKey: string;
  value: string;
  status: string;
  evidenceType: string;
  evidenceId: string;
  evidenceCreatedAt: string;
  evidenceHref: string | null;
};

const statusLabel: Record<string, string> = {
  UNCONFIRMED: '未確認',
  CONFIRMED: '確認済み',
  REJECTED: '違う',
};
const evidenceLabel: Record<string, string> = {
  LEARNING_REQUEST: '最初の希望',
  CONVERSATION_EVENT: '相談でのやりとり',
  PRACTICE_ANSWER: '実践の記録',
};

export function PersonalLearningPersonaCard({
  serviceSlug,
  enrollmentId,
  initialItems,
}: {
  serviceSlug: string;
  enrollmentId: string;
  initialItems: PersonaItem[];
}) {
  const [items, setItems] = useState(initialItems);
  const [drafts, setDrafts] = useState<Record<string, string>>(
    Object.fromEntries(initialItems.map((item) => [item.id, item.value])),
  );
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const endpoint = `/api/services/${serviceSlug}/ai-training/enrollments/${enrollmentId}/personal-learning/persona`;

  async function update(
    item: PersonaItem,
    payload: { value?: string; status?: 'CONFIRMED' | 'REJECTED' },
  ) {
    setBusyId(item.id);
    setError('');
    try {
      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ itemId: item.id, ...payload }),
      });
      if (!response.ok) throw new Error('保存できませんでした。画面を更新して再度お試しください。');
      const result = (await response.json()) as { data: PersonaItem };
      setItems((current) =>
        current.map((row) =>
          row.id === item.id ? { ...result.data, evidenceHref: row.evidenceHref } : row,
        ),
      );
      setDrafts((current) => ({ ...current, [item.id]: result.data.value }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存できませんでした。');
    } finally {
      setBusyId('');
    }
  }

  async function remove(item: PersonaItem) {
    if (
      !window.confirm('この項目を削除します。次回以降のAIには渡されなくなります。よろしいですか？')
    )
      return;
    setBusyId(item.id);
    setError('');
    try {
      const response = await fetch(endpoint, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ itemId: item.id }),
      });
      if (!response.ok) throw new Error('削除できませんでした。画面を更新して再度お試しください。');
      setItems((current) => current.filter((row) => row.id !== item.id));
      setDrafts((current) =>
        Object.fromEntries(Object.entries(current).filter(([id]) => id !== item.id)),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '削除できませんでした。');
    } finally {
      setBusyId('');
    }
  }

  return (
    <section className="service-entry__card" aria-labelledby="persona-items-title">
      <h2 id="persona-items-title">AIが理解していること</h2>
      <p>
        項目ごとに、元の記録を確認してから扱いを選べます。確認前の項目にも「AIによる推測」と表示します。
      </p>
      {error && <p role="alert">{error}</p>}
      {items.length === 0 && (
        <p>
          確認できる本人像はまだありません。今後、学習記録から推測された項目がここに表示されます。
        </p>
      )}
      <ul className="service-entry__list">
        {items.map((item) => {
          return (
            <li key={item.id} className="service-entry__card">
              <p>
                <strong>{item.attributeKey}</strong>
              </p>
              <label>
                <span>{item.status === 'CONFIRMED' ? '本人が確認した内容' : 'AIによる推測'}</span>
                <textarea
                  value={drafts[item.id] ?? item.value}
                  maxLength={1000}
                  onChange={(event) =>
                    setDrafts((current) => ({ ...current, [item.id]: event.target.value }))
                  }
                  aria-label={`${item.attributeKey}の内容`}
                />
              </label>
              <p>
                状態：{statusLabel[item.status] ?? '未確認'} ・ 根拠：
                {evidenceLabel[item.evidenceType] ?? '学習記録'}（
                {new Date(item.evidenceCreatedAt).toLocaleDateString('ja-JP')}）
              </p>
              {item.evidenceHref ? (
                <a href={item.evidenceHref}>根拠になった学習テーマの記録を開く</a>
              ) : (
                <p>根拠の記録は現在表示できません。記録が受講範囲内にない可能性があります。</p>
              )}
              <div className="service-entry__actions">
                <button
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() => void update(item, { value: drafts[item.id] ?? item.value })}
                >
                  修正して確認
                </button>
                <button
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() =>
                    void update(item, { value: drafts[item.id] ?? item.value, status: 'CONFIRMED' })
                  }
                >
                  この内容で確認
                </button>
                <button
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() => void update(item, { status: 'REJECTED' })}
                >
                  違う
                </button>
                <button
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() => void remove(item)}
                >
                  削除
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {items.some((item) => item.status === 'REJECTED') && (
        <p>「違う」とした項目は、次のAI呼び出しには渡しません。</p>
      )}
      <aside>
        <h3>削除後に同じ内容を再推測するか（決定待ち）</h3>
        <p>
          どちらにするかは未決定です。案A：削除は現在の項目だけに適用し、将来の新しい記録から同じ内容が再推測されることを許可する。案B：削除した属性を抑止記録として残し、本人が許可するまで同じ属性を再推測しない。
        </p>
        <p>
          現時点の削除操作は項目を完全に削除し、次回のAI呼び出しから除外します。将来の再推測ルールは、田中の決定後に実装します。
        </p>
        <p>
          提案：本人が明示的に許可するまで同じ属性を再推測しない案Bを推奨します。これは提案であり、まだ採用していません。
        </p>
      </aside>
    </section>
  );
}
