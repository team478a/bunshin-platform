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
  initialSuppressedAttributes,
}: {
  serviceSlug: string;
  enrollmentId: string;
  initialItems: PersonaItem[];
  initialSuppressedAttributes: string[];
}) {
  const [items, setItems] = useState(initialItems);
  const [suppressedAttributes, setSuppressedAttributes] = useState(initialSuppressedAttributes);
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
      !window.confirm(
        '削除すると、この内容はAIに渡されず、再び推測されることもありません。削除しますか？',
      )
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
      setSuppressedAttributes((current) => [
        item.attributeKey,
        ...current.filter((attributeKey) => attributeKey !== item.attributeKey),
      ]);
      setDrafts((current) =>
        Object.fromEntries(Object.entries(current).filter(([id]) => id !== item.id)),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '削除できませんでした。');
    } finally {
      setBusyId('');
    }
  }

  async function allowReinference(attributeKey: string) {
    setBusyId(attributeKey);
    setError('');
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ allowReinferenceFor: attributeKey }),
      });
      if (!response.ok)
        throw new Error('設定を変更できませんでした。画面を更新して再度お試しください。');
      setSuppressedAttributes((current) =>
        current.filter((suppressed) => suppressed !== attributeKey),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '設定を変更できませんでした。');
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
      {suppressedAttributes.length > 0 && (
        <section aria-labelledby="persona-suppressed-title">
          <h3 id="persona-suppressed-title">再推測しない項目</h3>
          <p>
            削除した項目の内容は保存されず、AIに渡されません。許可すると、今後の推測対象に戻ります。
          </p>
          <ul className="service-entry__list">
            {suppressedAttributes.map((attributeKey) => (
              <li key={attributeKey} className="service-entry__card">
                <p>{attributeKey}</p>
                <button
                  type="button"
                  disabled={busyId === attributeKey}
                  onClick={() => void allowReinference(attributeKey)}
                >
                  今後の再推測を許可
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
