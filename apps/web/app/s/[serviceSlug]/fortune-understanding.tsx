'use client';

import { useEffect, useState } from 'react';
import {
  confirmedFortuneUnderstanding,
  fortuneUnderstandingFieldLabels,
  fortuneUnderstandingTextLimit,
  type FortuneUnderstandingField,
  type FortuneUnderstandingItem,
  type FortuneUnderstandingSnapshot,
} from '@bunshin/capability-fortune';

const endpoint = (slug: string) => `/api/services/${slug}/fortune/understanding`;

async function saveSnapshot(
  serviceSlug: string,
  snapshot: FortuneUnderstandingSnapshot,
  items: ReturnType<typeof confirmedFortuneUnderstanding>,
) {
  const response = await fetch(endpoint(serviceSlug), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      revision: snapshot.revision,
      profileRevision: snapshot.profileRevision,
      items,
    }),
  });
  if (!response.ok) throw new Error('understanding not saved');
  const { data } = (await response.json()) as { data: FortuneUnderstandingSnapshot | null };
  if (!data) throw new Error('understanding unavailable');
  return data;
}

function UnderstandingItems({
  items,
  update,
  disabled,
  manage = false,
}: {
  items: FortuneUnderstandingItem[];
  update: (item: FortuneUnderstandingItem) => void;
  disabled: boolean;
  manage?: boolean;
}) {
  const [editing, setEditing] = useState<FortuneUnderstandingField | null>(null);
  const [draft, setDraft] = useState('');
  return (
    <div className="fortune-action">
      {items.map((item) => {
        if (item.state === 'UNKNOWN') return null;
        const label = fortuneUnderstandingFieldLabels[item.field];
        return (
          <section className="fortune-action-step fortune-action" key={item.field}>
            <h4>{label}</h4>
            <p>{item.state === 'INFERRED' ? '未確認の候補' : '本人が入力・確認した内容'}</p>
            {item.field === editing ? (
              <>
                <label className="form-field">
                  <span>{label}を訂正</span>
                  <textarea
                    rows={2}
                    maxLength={fortuneUnderstandingTextLimit(item.field)}
                    disabled={disabled}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                  />
                </label>
                <div className="button-row">
                  <button
                    className="button button--secondary"
                    type="button"
                    disabled={disabled || !draft.trim()}
                    onClick={() => {
                      update({
                        field: item.field,
                        state: 'CONFIRMED',
                        text: draft.trim(),
                        source: 'CORRECTION',
                      });
                      setEditing(null);
                    }}
                  >
                    訂正を反映する
                  </button>
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={() => setEditing(null)}
                  >
                    取消し
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="fortune-reading-body">{item.text}</p>
                <div className="button-row">
                  {item.state === 'INFERRED' && (
                    <button
                      className="button button--secondary"
                      type="button"
                      disabled={disabled}
                      onClick={() =>
                        update({
                          field: item.field,
                          state: 'CONFIRMED',
                          text: item.text,
                          source: 'CONFIRMED_SUGGESTION',
                        })
                      }
                    >
                      この候補を使う
                    </button>
                  )}
                  <button
                    className="button button--secondary"
                    type="button"
                    disabled={disabled}
                    aria-label={`${label}を訂正する`}
                    onClick={() => {
                      setDraft(item.text);
                      setEditing(item.field);
                    }}
                  >
                    訂正する
                  </button>
                  <button
                    className="button button--secondary"
                    type="button"
                    disabled={disabled}
                    aria-label={`${label}を外す`}
                    onClick={() => update({ field: item.field, state: 'UNKNOWN' })}
                  >
                    {manage ? '保存対象から外す' : '今回使わない'}
                  </button>
                </div>
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}

export function FortuneUnderstandingReview({
  serviceSlug,
  items,
  update,
  drawing,
}: {
  serviceSlug: string;
  items: FortuneUnderstandingItem[];
  update: (item: FortuneUnderstandingItem) => void;
  drawing: boolean;
}) {
  const [snapshot, setSnapshot] = useState<FortuneUnderstandingSnapshot | null>(null);
  const [selected, setSelected] = useState<FortuneUnderstandingField[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(endpoint(serviceSlug), { signal: controller.signal })
      .then(async (response) => {
        if (response.ok && !controller.signal.aborted)
          setSnapshot(((await response.json()) as { data: FortuneUnderstandingSnapshot }).data);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [serviceSlug]);
  const confirmed = confirmedFortuneUnderstanding(items);
  const saving = confirmed.filter(({ field }) => selected.includes(field));
  const unknown = items.filter((item) => item.state === 'UNKNOWN');

  async function save() {
    if (!snapshot?.canSave || !saving.length) return;
    setBusy(true);
    setError(false);
    setMessage('');
    try {
      const next = await saveSnapshot(serviceSlug, snapshot, [
        ...snapshot.items.filter(({ field }) => !saving.some((item) => item.field === field)),
        ...saving,
      ]);
      setSnapshot(next);
      setSelected([]);
      setMessage('選んだ内容を保存しました。');
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="fortune-action" aria-label="相談内容の確認">
      <h3>今回の相談内容を確認</h3>
      <p>候補は、使うと選んだ場合に今回の鑑定へ反映します。</p>
      <UnderstandingItems
        items={items}
        update={(item) => {
          setSelected((fields) => fields.filter((field) => field !== item.field));
          update(item);
        }}
        disabled={busy || drawing}
      />
      {unknown.length > 0 && (
        <p className="fortune-note">
          未確認 {unknown.map(({ field }) => fortuneUnderstandingFieldLabels[field]).join('、')}
        </p>
      )}
      {snapshot?.canSave && confirmed.length > 0 && (
        <details>
          <summary>次回のために選んで保存（任意）</summary>
          <p>選んだ項目だけを保存します。同じ項目は今回の内容で更新されます。</p>
          {confirmed.map(({ field }) => (
            <label className="fortune-check" key={field}>
              <input
                type="checkbox"
                disabled={busy || drawing}
                checked={selected.includes(field)}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setSelected((fields) =>
                    checked ? [...fields, field] : fields.filter((value) => value !== field),
                  );
                }}
              />
              <span>{fortuneUnderstandingFieldLabels[field]}を保存</span>
            </label>
          ))}
          <button
            className="button button--secondary"
            type="button"
            disabled={busy || drawing || !saving.length}
            onClick={() => void save()}
          >
            選んだ内容を保存する
          </button>
        </details>
      )}
      {message && <p role="status">{message}</p>}
      {error && (
        <p className="form-error" role="alert">
          保存できませんでした。鑑定にはこのまま進めます。
        </p>
      )}
    </section>
  );
}

export function FortuneSavedUnderstanding({
  serviceSlug,
  initial,
}: {
  serviceSlug: string;
  initial: FortuneUnderstandingSnapshot;
}) {
  const [snapshot, setSnapshot] = useState(initial);
  const [items, setItems] = useState<FortuneUnderstandingItem[]>(initial.items);
  const [changed, setChanged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const remaining = confirmedFortuneUnderstanding(items);

  async function save(removeAll: boolean) {
    setBusy(true);
    setError(false);
    setMessage('');
    try {
      if (removeAll || !remaining.length) {
        const response = await fetch(endpoint(serviceSlug), { method: 'DELETE' });
        if (!response.ok) throw new Error('understanding not deleted');
        setSnapshot({ ...snapshot, items: [], expiresAt: null });
        setItems([]);
        setMessage('保存した相談内容を削除しました。');
      } else {
        const next = await saveSnapshot(serviceSlug, snapshot, remaining);
        setSnapshot(next);
        setItems(next.items);
        setMessage('訂正を保存しました。');
      }
      setChanged(false);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-card fortune-action">
      <h2>保存した相談内容</h2>
      {snapshot.items.length > 0 && (
        <p className="fortune-note">
          プロフィールを保存し直すと、ここに保存した相談内容も消去されます。
        </p>
      )}
      {snapshot.expiresAt && (
        <p>
          保存期限{' '}
          {new Intl.DateTimeFormat('ja-JP', { dateStyle: 'long', timeZone: 'Asia/Tokyo' }).format(
            new Date(snapshot.expiresAt),
          )}
        </p>
      )}
      <UnderstandingItems
        manage
        items={items}
        disabled={busy || !snapshot.canSave}
        update={(item) => {
          setItems((current) =>
            current.map((value) => (value.field === item.field ? item : value)),
          );
          setChanged(true);
        }}
      />
      <div className="button-row">
        {changed && (
          <button
            className="button button--primary"
            type="button"
            disabled={busy}
            onClick={() => void save(false)}
          >
            変更を保存する
          </button>
        )}
        {snapshot.items.length > 0 && (
          <button
            className="button button--secondary"
            type="button"
            disabled={busy}
            onClick={() => void save(true)}
          >
            保存した内容をすべて削除する
          </button>
        )}
      </div>
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="form-error">
          更新できませんでした。設定を開き直してお試しください。
        </p>
      )}
    </section>
  );
}
