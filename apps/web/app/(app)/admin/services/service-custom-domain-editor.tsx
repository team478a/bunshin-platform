'use client';

import { useState, type FormEvent } from 'react';

type CustomDomain = {
  hostname: string;
  status: 'DRAFT' | 'VERIFIED' | 'ACTIVE' | 'DISABLED';
  verificationNote: string | null;
};

const statusLabel = {
  DRAFT: '準備中',
  VERIFIED: 'DNS設定待ち',
  ACTIVE: '利用中',
  DISABLED: '停止中',
} as const;

export function ServiceCustomDomainEditor({
  serviceId,
  domain,
}: {
  serviceId: string;
  domain: CustomDomain | null;
}) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function synchronize() {
    setSaving(true);
    setMessage('VercelとDNSの接続を確認しています…');
    try {
      const response = await fetch(
        `/api/admin/services/${encodeURIComponent(serviceId)}/custom-domain`,
        { method: 'POST' },
      );
      const result = (await response.json()) as {
        data?: { status?: string; verificationNote?: string | null };
        error?: { message?: string };
      };
      if (!response.ok)
        throw new Error(result.error?.message ?? '独自ドメインを確認できませんでした。');
      const status =
        result.data?.status === 'ACTIVE' ? '公開を開始しました。' : 'まだ設定が必要です。';
      setMessage(`${status}${result.data?.verificationNote ?? ''} 画面を更新します…`);
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '独自ドメインを確認できませんでした。');
      setSaving(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setSaving(true);
    setMessage('独自ドメインの設定を保存しています…');
    try {
      const response = await fetch(
        `/api/admin/services/${encodeURIComponent(serviceId)}/custom-domain`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            hostname: formData.get('hostname'),
            status: formData.get('status'),
            verificationNote: formData.get('verificationNote'),
            reason: formData.get('reason'),
          }),
        },
      );
      const result = (await response.json()) as { error?: { message?: string } };
      if (!response.ok)
        throw new Error(result.error?.message ?? '独自ドメインを保存できませんでした。');
      setMessage('保存しました。画面を更新します…');
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '独自ドメインを保存できませんでした。');
      setSaving(false);
    }
  }

  return (
    <details className="settings-card">
      <summary>OEM・独自ドメインを準備する</summary>
      <p>利用するドメインを保存したあと、Vercelへの登録とDNSの接続確認をこの画面から行えます。</p>
      <ol>
        <li>利用するドメインを入力し「準備中」で保存します。</li>
        <li>「Vercelへ登録・接続を確認」を押します。</li>
        <li>表示されたDNS設定をドメイン会社の画面へ登録し、もう一度確認します。</li>
      </ol>
      <p>状態が「利用中」になった時点で、そのドメインからサービスを開けます。</p>
      {domain ? <p>現在の状態：{statusLabel[domain.status]}</p> : null}
      <form className="admin-form-grid" onSubmit={(event) => void submit(event)}>
        <label>
          独自ドメイン
          <input
            defaultValue={domain?.hostname ?? ''}
            name="hostname"
            placeholder="app.example.jp"
            required
          />
        </label>
        <label>
          状態
          <select defaultValue={domain?.status ?? 'DRAFT'} name="status">
            <option value="DRAFT">準備中</option>
            <option value="DISABLED">停止中</option>
          </select>
        </label>
        <label>
          確認メモ（任意）
          <input
            defaultValue={domain?.verificationNote ?? ''}
            name="verificationNote"
            maxLength={1000}
          />
        </label>
        <label>
          変更理由
          <input
            name="reason"
            required
            maxLength={1000}
            placeholder="例：OEMサービスの独自ドメインを申請"
          />
        </label>
        <button disabled={saving} type="submit">
          {saving ? '保存中…' : '独自ドメインを保存する'}
        </button>
      </form>
      {domain && domain.status !== 'DISABLED' ? (
        <button disabled={saving} type="button" onClick={() => void synchronize()}>
          {saving ? '確認中…' : 'Vercelへ登録・接続を確認'}
        </button>
      ) : null}
      {domain?.verificationNote ? <p>{domain.verificationNote}</p> : null}
      {domain?.status === 'ACTIVE' ? (
        <p>
          LINE・メールログインを使う場合は、SupabaseのRedirect URLsに
          {` https://${domain.hostname}/auth/** `}
          も登録してください。
        </p>
      ) : null}
      <p aria-live="polite" role="status">
        {message}
      </p>
    </details>
  );
}
