'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { MemberTrackingLinkSettings } from '@bunshin/application';

const statusLabel = {
  DRAFT: '運営者の確認待ち',
  ACTIVE: '使用中',
  SUSPENDED: '停止中',
  EXPIRED: '期限切れ',
  DELETED: '削除済み',
} as const;

export function MemberTrackingLinkForm({
  serviceSlug,
  settings,
}: {
  serviceSlug: string;
  settings: MemberTrackingLinkSettings;
}) {
  const router = useRouter();
  const initialSystem = settings.systems[0];
  const [systemId, setSystemId] = useState(initialSystem?.id ?? '');
  const domains = useMemo(
    () => settings.systems.find((system) => system.id === systemId)?.domains ?? [],
    [settings.systems, systemId],
  );
  const current = settings.links.find((link) => link.systemId === systemId);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (name: string) => {
      const value = data.get(name);
      return typeof value === 'string' ? value : '';
    };
    setSaving(true);
    setMessage('保存しています…');
    try {
      const response = await fetch(
        `/api/services/${encodeURIComponent(serviceSlug)}/member-tracking-link`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            systemId,
            allowedDomainId: text('allowedDomainId'),
            url: text('url'),
          }),
        },
      );
      const result = (await response.json()) as { error?: { message?: string } };
      if (!response.ok)
        throw new Error(
          result.error?.message === 'tracking URL is not allowed'
            ? 'このURLは登録できません。運営者が指定したURLか確認してください。'
            : 'URLを保存できませんでした。入力内容を確認してください。',
        );
      setMessage('登録しました。運営者の確認後、投稿案で使用されます。');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'URLを保存できませんでした。');
    } finally {
      setSaving(false);
    }
  }

  if (!initialSystem) {
    return (
      <div className="empty-state">
        <p>代理店URLの登録先を準備中です。運営者からの案内をお待ちください。</p>
      </div>
    );
  }

  return (
    <form className="admin-form-grid" onSubmit={(event) => void submit(event)}>
      <label>
        代理店サービス
        <select value={systemId} onChange={(event) => setSystemId(event.target.value)}>
          {settings.systems.map((system) => (
            <option key={system.id} value={system.id}>
              {system.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        URLの種類
        <select name="allowedDomainId" key={systemId} defaultValue={domains[0]?.id} required>
          {domains.map((domain) => (
            <option key={domain.id} value={domain.id}>
              {domain.hostname}
            </option>
          ))}
        </select>
      </label>
      <label>
        あなたの代理店URL
        <input
          name="url"
          type="url"
          inputMode="url"
          required
          maxLength={2048}
          key={current?.id ?? systemId}
          defaultValue={current?.url ?? ''}
          placeholder={domains[0] ? `https://${domains[0].hostname}/...` : 'https://...'}
          autoCapitalize="none"
          autoCorrect="off"
        />
      </label>
      <small>外部サービスから発行された、あなた専用のURLをそのまま貼り付けてください。</small>
      {current && (
        <p>
          現在の状態：<strong>{statusLabel[current.status]}</strong>
        </p>
      )}
      <button className="button button--primary button--full" type="submit" disabled={saving}>
        {saving ? '保存中…' : current ? '代理店URLを変更する' : '代理店URLを登録する'}
      </button>
      {message && (
        <p className="notice" role="status" aria-live="polite">
          {message}
        </p>
      )}
    </form>
  );
}
