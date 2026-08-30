'use client';

import { useState, type FormEvent } from 'react';

type Props = {
  service: {
    id: string;
    displayName: string;
    visibility: 'PUBLIC' | 'PRIVATE';
    status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
    poweredByEnabled: boolean;
    startsAt: string | null;
    endsAt: string | null;
  };
};

const localDateTime = (value: string | null) =>
  value === null
    ? ''
    : new Date(value)
        .toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo', hour12: false })
        .slice(0, 16)
        .replace(' ', 'T');

export function ServiceLifecycleEditor({ service }: Props) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (name: string) => {
      const value = data.get(name);
      return typeof value === 'string' ? value : '';
    };
    const instant = (name: string) => {
      const value = text(name);
      return value === '' ? null : new Date(value).toISOString();
    };
    setSaving(true);
    setMessage('保存しています…');
    try {
      const response = await fetch(`/api/admin/services/${service.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          visibility: text('visibility'),
          status: text('status'),
          poweredByEnabled: data.has('poweredByEnabled'),
          startsAt: instant('startsAt'),
          endsAt: instant('endsAt'),
          reason: text('reason'),
        }),
      });
      const result = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(result.error?.message ?? '設定を保存できませんでした。');
      setMessage('保存しました。最新の状態を表示します。');
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '設定を保存できませんでした。');
      setSaving(false);
    }
  }

  return (
    <details className="settings-card">
      <summary>
        <strong>{service.displayName}</strong> —{' '}
        {service.status === 'SUSPENDED'
          ? '利用停止中'
          : service.visibility === 'PUBLIC'
            ? '公開中'
            : '準備中'}
      </summary>
      <form onSubmit={(event) => void submit(event)} className="admin-form-grid">
        <label>
          公開状態
          <select name="visibility" defaultValue={service.visibility}>
            <option value="PRIVATE">準備中（利用者には公開しない）</option>
            <option value="PUBLIC">公開する</option>
          </select>
        </label>
        <label>
          サービスの利用
          <select
            name="status"
            defaultValue={service.status}
            disabled={service.status === 'ARCHIVED'}
          >
            <option value="ACTIVE">利用できる</option>
            <option value="SUSPENDED">一時停止する</option>
          </select>
          <small>一時停止すると、利用者とサービス管理者はこのサービスを使えません。</small>
        </label>
        <label>
          利用開始日時
          <input
            name="startsAt"
            type="datetime-local"
            defaultValue={localDateTime(service.startsAt)}
          />
          <small>日本時間で入力します。空欄なら開始日の制限はありません。</small>
        </label>
        <label>
          利用終了日時
          <input name="endsAt" type="datetime-local" defaultValue={localDateTime(service.endsAt)} />
          <small>日本時間で入力します。空欄なら終了日の制限はありません。</small>
        </label>
        <label>
          <input
            name="poweredByEnabled"
            type="checkbox"
            defaultChecked={service.poweredByEnabled}
          />{' '}
          「Powered by ワタシワークス」を表示する
        </label>
        <label>
          変更理由
          <input name="reason" required maxLength={1000} placeholder="例：公開準備が完了したため" />
        </label>
        <button type="submit" disabled={saving || service.status === 'ARCHIVED'}>
          {saving ? '保存中…' : '公開・利用設定を保存する'}
        </button>
      </form>
      <p role="status" aria-live="polite">
        {message}
      </p>
    </details>
  );
}
