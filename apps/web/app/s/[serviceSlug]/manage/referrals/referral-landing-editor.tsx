'use client';

import { useState, type FormEvent } from 'react';
import type { ReferralLandings } from '../../../../../src/services/referral-landings';
import './referral-management.css';

export function ReferralLandingEditor({
  serviceSlug,
  signupUrl,
  initial,
}: {
  serviceSlug: string;
  signupUrl: string;
  initial: ReferralLandings;
}) {
  const [draft, setDraft] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [editingId, setEditingId] = useState<string | null>(
    initial.activeId ?? initial.pages[0]?.id ?? null,
  );
  const [busy, setBusy] = useState(false);
  const [copyMessage, setCopyMessage] = useState('');
  const [feedback, setFeedback] = useState<{ error: boolean; message: string } | null>(null);
  const editing = draft.pages.find((page) => page.id === editingId);
  const active = saved.pages.find((page) => page.id === saved.activeId);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const signupSnippet = `<a id="referral-signup" href="${signupUrl}">LINEで申し込む</a>
<script>
{
  const button = document.getElementById('referral-signup');
  const source = new URLSearchParams(window.location.search);
  const destination = new URL(button.href);
  if (source.get('ref') && source.get('rc')) {
    destination.searchParams.set('ref', source.get('ref'));
    destination.searchParams.set('rc', source.get('rc'));
    button.href = destination.href;
  }
}
</script>`;

  async function copySignupSnippet() {
    try {
      await navigator.clipboard.writeText(signupSnippet);
      setCopyMessage('コピーしました。');
    } catch {
      setCopyMessage('コード欄から選択してコピーしてください。');
    }
  }

  function addPage() {
    const id = crypto.randomUUID();
    setDraft({ ...draft, pages: [...draft.pages, { id, name: '', url: '' }] });
    setEditingId(id);
    setFeedback(null);
  }

  function editPage(patch: Partial<Pick<ReferralLandings['pages'][number], 'name' | 'url'>>) {
    setDraft({
      ...draft,
      pages: draft.pages.map((page) => (page.id === editingId ? { ...page, ...patch } : page)),
    });
    setFeedback(null);
  }

  function deletePage(id: string) {
    const pages = draft.pages.filter((page) => page.id !== id);
    setDraft({ ...draft, pages, activeId: draft.activeId === id ? null : draft.activeId });
    setEditingId(pages[0]?.id ?? null);
    setFeedback(null);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const incomplete = draft.pages.find(
      (page) => !page.name.trim() || !/^https:\/\//i.test(page.url.trim()),
    );
    if (incomplete) {
      setEditingId(incomplete.id);
      setFeedback({ error: true, message: 'すべてのLPに名前とHTTPS URLを入力してください。' });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch(
        `/api/services/${encodeURIComponent(serviceSlug)}/referral-management`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ kind: 'LANDINGS', settings: draft }),
        },
      );
      if (!response.ok) {
        const message =
          response.status === 409
            ? '別の操作で設定が更新されました。ページを再読み込みしてください。'
            : response.status === 400
              ? 'LPの名前とHTTPS URLを確認してください。'
              : '保存できませんでした。時間をおいてもう一度お試しください。';
        setFeedback({ error: true, message });
        return;
      }
      const { data } = (await response.json()) as { data: ReferralLandings };
      setSaved(data);
      setDraft(data);
      setFeedback({ error: false, message: '紹介先LPの設定を保存しました。' });
    } catch {
      setFeedback({ error: true, message: '通信できませんでした。接続を確認してください。' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-card referral-landings" aria-labelledby="referral-landings-title">
      <h2 id="referral-landings-title">紹介先LP</h2>
      <p>
        現在の紹介先 <strong>{active?.name ?? '標準の参加登録ページ'}</strong>
      </p>
      <form onSubmit={(event) => void save(event)}>
        <fieldset disabled={busy}>
          <div className="referral-landings__grid">
            <label>
              紹介URLの転送先
              <select
                value={draft.activeId ?? ''}
                onChange={(event) => {
                  setDraft({ ...draft, activeId: event.target.value || null });
                  setFeedback(null);
                }}
              >
                <option value="">標準の参加登録ページ</option>
                {draft.pages.map((page) => (
                  <option key={page.id} value={page.id}>
                    {page.name || '新しいLP'}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <label>
                編集するLP
                <select
                  value={editingId ?? ''}
                  disabled={!draft.pages.length}
                  onChange={(event) => setEditingId(event.target.value)}
                >
                  {!draft.pages.length && <option value="">登録なし</option>}
                  {draft.pages.map((page) => (
                    <option key={page.id} value={page.id}>
                      {page.name || '新しいLP'}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="button button--secondary"
                onClick={addPage}
                disabled={draft.pages.length >= 20}
              >
                LPを追加
              </button>
            </div>
          </div>
          {editing && (
            <div className="referral-landings__fields" key={editing.id}>
              <label>
                LPの名前
                <input
                  value={editing.name}
                  onChange={(event) => editPage({ name: event.target.value })}
                  required
                  maxLength={80}
                />
              </label>
              <label>
                LPのURL
                <input
                  type="url"
                  value={editing.url}
                  onChange={(event) => editPage({ url: event.target.value })}
                  required
                  maxLength={2048}
                  placeholder="https://"
                />
              </label>
              <button
                type="button"
                className="button button--secondary"
                onClick={() => deletePage(editing.id)}
              >
                このLPを削除
              </button>
            </div>
          )}
          <button type="submit" className="button button--primary" disabled={!dirty || busy}>
            {busy ? '保存中…' : '紹介先を保存'}
          </button>
        </fieldset>
        {feedback && <p role={feedback.error ? 'alert' : 'status'}>{feedback.message}</p>}
      </form>
      <details>
        <summary>外部LPの申込ボタンの設定</summary>
        <p>
          管理しているHTTPSのLPを登録してください。LPを表示したURLに付いた <code>ref</code> と{' '}
          <code>rc</code> を申込ボタンから次の参加登録ページに渡すと、紹介実績を引き継ぎます。
        </p>
        <label>
          申込ボタンのコード
          <textarea readOnly rows={4} value={signupSnippet} />
        </label>
        <button
          type="button"
          className="button button--secondary"
          onClick={() => void copySignupSnippet()}
        >
          コードをコピー
        </button>
        {copyMessage && <p role="status">{copyMessage}</p>}
        <p>
          LINEの友だち追加ボタンを置く場合は、追加後もこのLPの申込ボタンから進むよう案内してください。
        </p>
      </details>
    </section>
  );
}
