'use client';

import { FORTUNE_WEEKLY_NOTIFICATION_TOPIC } from '@bunshin/capability-fortune';
import { useEffect, useState } from 'react';

interface PreferenceResponse {
  data?: {
    enabled?: boolean;
  };
  error?: {
    message?: string;
  };
}

async function loadPreference(serviceSlug: string) {
  const response = await fetch(
    `/api/services/${serviceSlug}/notification-preferences/${FORTUNE_WEEKLY_NOTIFICATION_TOPIC}?channel=LINE`,
    { cache: 'no-store' },
  );
  const body = (await response.json()) as PreferenceResponse;
  if (!response.ok) throw new Error(body.error?.message ?? '通知設定を確認できませんでした。');
  return body.data?.enabled === true;
}

async function savePreference(serviceSlug: string, enabled: boolean) {
  const response = await fetch(
    `/api/services/${serviceSlug}/notification-preferences/${FORTUNE_WEEKLY_NOTIFICATION_TOPIC}`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel: 'LINE', enabled }),
    },
  );
  const body = (await response.json()) as PreferenceResponse;
  if (!response.ok) throw new Error(body.error?.message ?? '通知設定を保存できませんでした。');
  return body.data?.enabled === true;
}

export function FortuneNotificationSetting({ serviceSlug }: { serviceSlug: string }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('通知設定を確認しています…');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void loadPreference(serviceSlug)
      .then((value) => {
        if (!active) return;
        setEnabled(value);
        setMessage('');
      })
      .catch((cause) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : '通知設定を確認できませんでした。');
        setMessage('');
      });
    return () => {
      active = false;
    };
  }, [serviceSlug]);

  return (
    <div className="fortune-notification-setting">
      <div>
        <strong>週1回、LINEで受け取る</strong>
        <p>
          {enabled === null
            ? '現在の設定を確認しています。'
            : enabled
              ? '現在は受け取る設定です。'
              : '現在は受け取らない設定です。'}
        </p>
      </div>
      <button
        className={`button ${enabled ? 'button--secondary' : 'button--primary'}`}
        type="button"
        disabled={enabled === null || busy}
        aria-pressed={enabled === true}
        onClick={() =>
          void (async () => {
            if (enabled === null) return;
            setBusy(true);
            setError('');
            setMessage('');
            try {
              const next = await savePreference(serviceSlug, !enabled);
              setEnabled(next);
              setMessage(next ? 'LINE通知を受け取る設定にしました。' : 'LINE通知を停止しました。');
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : '通知設定を保存できませんでした。');
            } finally {
              setBusy(false);
            }
          })()
        }
      >
        {busy ? '保存しています…' : enabled ? '通知を停止する' : '通知を受け取る'}
      </button>
      {message && (
        <p className="form-success" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
