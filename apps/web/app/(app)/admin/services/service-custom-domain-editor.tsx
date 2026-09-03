'use client';

import { useState, type FormEvent } from 'react';

type CustomDomain = {
  hostname: string;
  status: 'DRAFT' | 'VERIFIED' | 'ACTIVE' | 'DISABLED';
  verificationNote: string | null;
};

export function ServiceCustomDomainEditor({
  serviceId,
  domain,
}: {
  serviceId: string;
  domain: CustomDomain | null;
}) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

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
      <p>
        ここでは利用予定のホスト名と確認状態だけを管理します。DNSやVercelの接続をこの画面から自動では変更しません。
      </p>
      <ol>
        <li>利用するドメインを入力し「準備中」で保存します。</li>
        <li>DNS・ホスティング側で接続を確認した後、「確認済み」に変更します。</li>
        <li>実際にサービス専用画面で開けることを確認してから「利用中」にします。</li>
      </ol>
      <p>「利用中」にしても、DNS設定・ホスト名ルーティングが未実装の環境では公開されません。</p>
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
            <option value="VERIFIED">確認済み</option>
            <option value="ACTIVE">利用中</option>
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
      <p aria-live="polite" role="status">
        {message}
      </p>
    </details>
  );
}
