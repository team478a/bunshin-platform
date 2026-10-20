'use client';

import { useState, type FormEvent } from 'react';

type ToolKey = 'CHATGPT' | 'CLAUDE' | 'GEMINI' | 'CANVA';
type Audit = {
  action: string;
  reason: string | null;
  occurredAt: string;
  actorName: string;
};
type Item = {
  id: string;
  toolKey: ToolKey;
  title: string;
  summary: string;
  sourceUrl: string;
  sourceTitle: string;
  publishedAt: string | null;
  status: string;
  createdAt: string;
  expiresAt: string | null;
  creatorName: string;
  reviewerName: string | null;
  reviewedAt: string | null;
  audits: Audit[];
};
const toolNames: Record<ToolKey, string> = {
  CHATGPT: 'ChatGPT',
  CLAUDE: 'Claude',
  GEMINI: 'Gemini',
  CANVA: 'Canva',
};
const statusNames: Record<string, string> = {
  PENDING: '確認待ち',
  APPROVED: '承認済み',
  REJECTED: '却下',
  EXPIRED: '期限切れ',
};

export function PersonalLearningToolFeatureAdmin({
  canReview,
  initialItems,
}: {
  canReview: boolean;
  initialItems: Item[];
}) {
  const items = initialItems;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function post(payload: Record<string, unknown>) {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/personal-learning-tool-features', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        setMessage(result.error?.message ?? '保存できませんでした。');
        return false;
      }
      window.location.reload();
      return true;
    } catch {
      setMessage('通信できませんでした。画面を更新して状態を確認してください。');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const publishedAtValue = form.get('publishedAt');
    await post({
      action: 'CREATE',
      toolKey: form.get('toolKey'),
      title: form.get('title'),
      summary: form.get('summary'),
      sourceUrl: form.get('sourceUrl'),
      sourceTitle: form.get('sourceTitle'),
      publishedAt:
        typeof publishedAtValue === 'string' && publishedAtValue
          ? new Date(publishedAtValue).toISOString()
          : null,
    });
  }

  async function review(featureId: string, action: 'APPROVE' | 'REJECT') {
    const reason = window.prompt(
      action === 'APPROVE' ? '承認理由を入力してください' : '却下理由を入力してください',
    );
    if (!reason?.trim()) return;
    await post({ action, featureId, reason });
  }

  return (
    <>
      <section className="settings-card">
        <h2>公式更新情報を登録</h2>
        <p>
          手動登録のみです。URLはHTTPSかつ各ツールの公式ドメインに限定され、外部検索・AI呼び出しは行いません。
        </p>
        <form onSubmit={(event) => void create(event)}>
          <label>
            対象ツール
            <select name="toolKey" required defaultValue="CHATGPT">
              {Object.entries(toolNames).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            新機能の名前
            <input name="title" required minLength={3} maxLength={160} />
          </label>
          <label>
            内容の要約
            <textarea name="summary" required minLength={20} maxLength={2000} />
          </label>
          <label>
            公式情報のページ名
            <input name="sourceTitle" required minLength={3} maxLength={500} />
          </label>
          <label>
            公式情報のURL
            <input name="sourceUrl" type="url" required maxLength={2000} />
          </label>
          <label>
            公開日（分かる場合）
            <input name="publishedAt" type="date" />
          </label>
          <button type="submit" disabled={busy}>
            確認待ちで登録
          </button>
        </form>
      </section>
      {message ? <p role="status">{message}</p> : null}
      <section className="settings-card">
        <h2>登録済み情報</h2>
        {items.length === 0 ? (
          <p>登録された情報はありません。</p>
        ) : (
          <div className="stack">
            {items.map((item) => (
              <article className="settings-card" key={item.id}>
                <p>
                  {toolNames[item.toolKey]}・{statusNames[item.status] ?? item.status}
                </p>
                <h3>{item.title}</h3>
                <p>{item.summary}</p>
                <p>
                  出典：
                  <a href={item.sourceUrl} target="_blank" rel="noreferrer">
                    {item.sourceTitle}
                  </a>
                </p>
                <p>
                  登録: {item.creatorName} / {new Date(item.createdAt).toLocaleDateString('ja-JP')}
                  {item.expiresAt
                    ? ` / 承認期限: ${new Date(item.expiresAt).toLocaleDateString('ja-JP')}`
                    : ''}
                </p>
                {canReview && item.status === 'PENDING' ? (
                  <div className="button-row">
                    <button disabled={busy} onClick={() => void review(item.id, 'APPROVE')}>
                      90日間承認
                    </button>
                    <button disabled={busy} onClick={() => void review(item.id, 'REJECT')}>
                      却下
                    </button>
                  </div>
                ) : null}
                {item.reviewerName && item.reviewedAt ? (
                  <p>
                    確認: {item.reviewerName} /{' '}
                    {new Date(item.reviewedAt).toLocaleDateString('ja-JP')}
                  </p>
                ) : null}
                {item.audits.length ? (
                  <details>
                    <summary>操作履歴</summary>
                    <ul>
                      {item.audits.map((audit, index) => (
                        <li key={`${audit.action}-${audit.occurredAt}-${index}`}>
                          {new Date(audit.occurredAt).toLocaleString('ja-JP')} {audit.actorName}:{' '}
                          {audit.action} {audit.reason ?? ''}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
