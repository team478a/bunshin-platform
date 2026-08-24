'use client';
import { useState, type FormEvent } from 'react';
type Configuration = {
  id: string;
  version: number;
  status: 'DRAFT' | 'ACTIVE' | 'DISABLED' | 'ERROR';
  apiKeyMask: string;
  fromEmail: string;
  recipientEmails: string[];
  globallyPaused: boolean;
  lastVerifiedAt: string | null;
  lastErrorCategory: string | null;
};
export function AdminEmailEditor({
  environment,
  initialConfigurations,
}: {
  environment: string;
  initialConfigurations: Configuration[];
}) {
  const [items, setItems] = useState(initialConfigurations);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const recipientsValue = form.get('recipientEmails');
    const response = await fetch('/api/admin/email-configurations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        apiKey: form.get('apiKey'),
        fromEmail: form.get('fromEmail'),
        recipientEmails: (typeof recipientsValue === 'string' ? recipientsValue : '')
          .split(/[\n,]/)
          .map((value) => value.trim())
          .filter(Boolean),
        reason: form.get('reason'),
      }),
    });
    const result = (await response.json()) as {
      data?: Configuration;
      error?: { message?: string };
    };
    if (response.ok && result.data) {
      setItems((current) => [result.data!, ...current]);
      setMessage('停止中で保存しました。次にテストメールを送ってください。');
      event.currentTarget.reset();
    } else setMessage(result.error?.message ?? '保存できませんでした。');
    setBusy(false);
  }
  async function action(id: string, name: 'test' | 'activate' | 'pause') {
    const reason = name === 'test' ? null : window.prompt('操作する理由を入力してください。');
    if (name !== 'test' && !reason) return;
    if (
      name === 'activate' &&
      environment === 'PRODUCTION' &&
      !window.confirm('本番で障害メールを送り始めます。テストメールを確認しましたか？')
    )
      return;
    setBusy(true);
    const response = await fetch(`/api/admin/email-configurations/${id}/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      ...(reason ? { body: JSON.stringify({ reason }) } : {}),
    });
    const result = (await response.json()) as {
      data?: Configuration | { success: boolean; errorCategory: string | null };
      error?: { message?: string };
    };
    if (!response.ok || !result.data) setMessage(result.error?.message ?? '操作できませんでした。');
    else if (name === 'test')
      setMessage(
        (result.data as { success: boolean }).success
          ? 'テストメールを送りました。受信箱を確認してください。'
          : '送信できませんでした。APIキー、送信元ドメイン、通知先を確認してください。',
      );
    else {
      const updated = result.data as Configuration;
      setItems((current) =>
        current.map((item) =>
          item.id === id
            ? updated
            : name === 'activate' && item.status === 'ACTIVE'
              ? { ...item, status: 'DISABLED', globallyPaused: true }
              : item,
        ),
      );
      setMessage(
        name === 'activate' ? '障害メールを使い始めました。' : '障害メールを停止しました。',
      );
    }
    setBusy(false);
  }
  return (
    <>
      <section className="settings-card">
        <h2>新しい設定</h2>
        {message ? <p role="status">{message}</p> : null}
        <form onSubmit={(event) => void create(event)}>
          <label>
            Resend APIキー
            <input
              name="apiKey"
              type="password"
              autoComplete="new-password"
              minLength={16}
              required
            />
          </label>
          <label>
            送信元メール
            <input name="fromEmail" type="email" placeholder="alerts@example.com" required />
          </label>
          <label>
            通知先メール（1行に1件、最大10件）
            <textarea name="recipientEmails" required rows={4} />
          </label>
          <label>
            変更した理由
            <input name="reason" minLength={3} maxLength={500} required />
          </label>
          <button disabled={busy}>停止中で保存</button>
        </form>
      </section>
      <section className="settings-card">
        <h2>保存した設定</h2>
        {items.length === 0 ? (
          <p>まだ設定はありません。</p>
        ) : (
          <ul>
            {items.map((item) => (
              <li key={item.id}>
                <strong>
                  第{item.version}版・
                  {item.status === 'ACTIVE'
                    ? '使用中'
                    : item.status === 'ERROR'
                      ? 'エラー'
                      : '停止中'}
                </strong>
                <p>
                  APIキー：{item.apiKeyMask}／送信元：{item.fromEmail}
                </p>
                <p>通知先：{item.recipientEmails.join('、')}</p>
                <button disabled={busy} onClick={() => void action(item.id, 'test')}>
                  テストメールを送る
                </button>
                {item.status !== 'ACTIVE' && item.lastVerifiedAt && !item.lastErrorCategory ? (
                  <button disabled={busy} onClick={() => void action(item.id, 'activate')}>
                    使い始める
                  </button>
                ) : null}
                {item.status === 'ACTIVE' && !item.globallyPaused ? (
                  <button disabled={busy} onClick={() => void action(item.id, 'pause')}>
                    緊急停止
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
