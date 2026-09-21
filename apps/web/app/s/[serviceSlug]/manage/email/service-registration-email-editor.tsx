'use client';

import { useState, type FormEvent } from 'react';

export function ServiceRegistrationEmailEditor({
  serviceSlug,
  value,
}: {
  serviceSlug: string;
  value: {
    enabled: boolean;
    providerMode: 'PLATFORM' | 'DEDICATED_RESEND';
    apiKeyMask: string | null;
    fromName: string;
    fromEmail: string;
    replyToEmail: string;
    subject: string;
    body: string;
    verified: boolean;
  };
}) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const endpoint = `/api/services/${encodeURIComponent(serviceSlug)}/registration-email`;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => {
      const entry = form.get(name);
      return typeof entry === 'string' ? entry : '';
    };
    setSaving(true);
    setMessage('保存しています…');
    const response = await fetch(endpoint, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        enabled: form.has('enabled'),
        providerMode: text('providerMode'),
        apiKey: text('apiKey') || undefined,
        fromName: text('fromName'),
        fromEmail: text('fromEmail'),
        replyToEmail: text('replyToEmail'),
        subject: text('subject'),
        body: text('body'),
      }),
    });
    setSaving(false);
    if (!response.ok) {
      setMessage('保存できませんでした。入力内容をご確認ください。');
      return;
    }
    setMessage('保存しました。変更後はもう一度テスト送信してください。');
  }

  async function test() {
    setSaving(true);
    setMessage('管理者メールへテスト送信しています…');
    const response = await fetch(endpoint, { method: 'POST' });
    setSaving(false);
    setMessage(
      response.ok
        ? 'テストメールを送信しました。受信を確認できれば登録完了メールを利用できます。'
        : 'テスト送信に失敗しました。送信元ドメインとAPIキーをご確認ください。',
    );
  }

  return (
    <form className="admin-form-grid" onSubmit={(event) => void save(event)}>
      <label className="field field--checkbox">
        <input name="enabled" type="checkbox" defaultChecked={value.enabled} />
        <span>登録・承認完了時に案内メールを送る</span>
      </label>
      <label>
        メール配信方法
        <select name="providerMode" defaultValue={value.providerMode}>
          <option value="PLATFORM">ワタシワークス共通メール基盤を使う</option>
          <option value="DEDICATED_RESEND">自社のResend APIキーを使う</option>
        </select>
      </label>
      <label>
        自社Resend APIキー
        <input
          name="apiKey"
          type="password"
          autoComplete="new-password"
          placeholder={value.apiKeyMask ?? 're_…'}
        />
        <small>専用配信を選ぶ場合だけ入力します。保存後に値は再表示されません。</small>
      </label>
      <label>
        送信者名
        <input name="fromName" required maxLength={120} defaultValue={value.fromName} />
      </label>
      <label>
        送信元メール
        <input
          name="fromEmail"
          type="email"
          required
          maxLength={320}
          defaultValue={value.fromEmail}
        />
      </label>
      <label>
        返信先メール（任意）
        <input name="replyToEmail" type="email" maxLength={320} defaultValue={value.replyToEmail} />
      </label>
      <label>
        件名
        <input name="subject" required maxLength={200} defaultValue={value.subject} />
      </label>
      <label>
        本文
        <textarea name="body" required maxLength={10000} rows={10} defaultValue={value.body} />
        <small>
          {'{{name}}'} は利用者名、{'{{serviceName}}'} はサービス名に置き換わります。
        </small>
      </label>
      <p>接続状態：{value.verified ? '確認済み' : 'テスト送信が必要です'}</p>
      <button type="submit" disabled={saving}>
        {saving ? '処理中…' : '保存する'}
      </button>
      <button type="button" disabled={saving} onClick={() => void test()}>
        テスト送信する
      </button>
      <p role="status" aria-live="polite">
        {message}
      </p>
    </form>
  );
}
