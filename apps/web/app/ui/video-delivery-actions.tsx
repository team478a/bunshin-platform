'use client';

import { useEffect, useState } from 'react';

type DeliveryStatus =
  'ASSIGNED' | 'VIEWED' | 'ACCEPTED' | 'DECLINED' | 'POSTED' | 'EXPIRED' | 'REVOKED';

export function VideoDeliveryActions({
  serviceSlug,
  deliveryId,
  status: initialStatus,
  usageMessage,
}: {
  serviceSlug: string;
  deliveryId: string;
  status: DeliveryStatus;
  usageMessage: string;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initialStatus !== 'ASSIGNED') return;
    void fetch(
      `/api/services/${encodeURIComponent(serviceSlug)}/video-deliveries/${encodeURIComponent(deliveryId)}/VIEWED`,
      { method: 'POST' },
    ).then(async (response) => {
      if (!response.ok) return;
      const result = (await response.json()) as { data?: { status?: DeliveryStatus } };
      if (result.data?.status) setStatus(result.data.status);
    });
  }, [deliveryId, initialStatus, serviceSlug]);

  async function action(next: 'ACCEPTED' | 'DECLINED' | 'POSTED') {
    setSaving(true);
    setMessage('記録しています…');
    try {
      const response = await fetch(
        `/api/services/${encodeURIComponent(serviceSlug)}/video-deliveries/${encodeURIComponent(deliveryId)}/${next}`,
        { method: 'POST' },
      );
      const result = (await response.json()) as {
        data?: { status?: DeliveryStatus };
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(result.error?.message ?? '記録できませんでした。');
      if (result.data?.status) setStatus(result.data.status);
      setMessage(
        next === 'ACCEPTED'
          ? '採用しました。動画を確認して、ご自身でSNSへ投稿してください。'
          : next === 'DECLINED'
            ? '今回は使わないことを記録しました。'
            : '投稿しました。おつかれさまでした。',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '記録できませんでした。');
    } finally {
      setSaving(false);
    }
  }

  if (status === 'DECLINED') {
    return (
      <section className="settings-card">
        <h2>今回は使わない</h2>
        <p>この動画は投稿には使わないことを記録しました。</p>
      </section>
    );
  }

  if (status === 'EXPIRED') {
    return (
      <section className="settings-card">
        <h2>この動画の利用期限が過ぎました</h2>
        <p>動画は開けません。もう一度使いたい場合は、サービスの管理者へお問い合わせください。</p>
      </section>
    );
  }

  if (status === 'REVOKED') {
    return (
      <section className="settings-card">
        <h2>この動画の利用は停止されました</h2>
        <p>動画は開けません。内容の確認が必要な場合は、サービスの管理者へお問い合わせください。</p>
      </section>
    );
  }

  return (
    <section className="settings-card">
      <h2>この動画を使いますか？</h2>
      <p>{usageMessage}</p>
      {status === 'ASSIGNED' || status === 'VIEWED' ? (
        <div className="button-row">
          <button
            className="button button--primary"
            disabled={saving}
            onClick={() => void action('ACCEPTED')}
            type="button"
          >
            この動画を使う
          </button>
          <button
            className="button button--secondary"
            disabled={saving}
            onClick={() => void action('DECLINED')}
            type="button"
          >
            今回は使わない
          </button>
        </div>
      ) : (
        <>
          <p>採用済みです。内容を確認し、ご自身でSNSへ投稿してください。</p>
          <a
            className="button button--primary"
            href={`/api/services/${encodeURIComponent(serviceSlug)}/video-deliveries/${encodeURIComponent(deliveryId)}/download`}
          >
            動画を開く
          </a>
          {status !== 'POSTED' ? (
            <button
              className="button button--secondary"
              disabled={saving}
              onClick={() => void action('POSTED')}
              type="button"
            >
              投稿しました
            </button>
          ) : (
            <p>投稿完了を記録しました。おつかれさまでした。</p>
          )}
        </>
      )}
      <p
        aria-live="polite"
        className={message ? 'notice notice--success' : undefined}
        role="status"
      >
        {message}
      </p>
    </section>
  );
}
