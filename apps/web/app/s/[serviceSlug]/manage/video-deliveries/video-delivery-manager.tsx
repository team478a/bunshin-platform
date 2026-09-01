'use client';

import { useState, type FormEvent } from 'react';

export type VideoDeliveryCandidate = {
  membershipId: string;
  videoProjectId: string;
  videoRenderId: string;
  memberName: string;
  title: string;
  completedAt: string | null;
  enrollments: Array<{ id: string; label: string }>;
};

export type VideoDeliveryStatusRow = {
  id: string;
  memberName: string;
  title: string;
  status: 'ASSIGNED' | 'VIEWED' | 'ACCEPTED' | 'DECLINED' | 'POSTED' | 'EXPIRED';
  assignedAt: string;
  viewedAt: string | null;
  acceptedAt: string | null;
  declinedAt: string | null;
  postedAt: string | null;
  notificationStatus: 'PENDING' | 'SENT' | 'FAILED' | 'CANCELLED';
  notificationErrorCode: string | null;
  notificationAttemptCount: number;
  notifiedAt: string | null;
};

const statusLabel: Record<VideoDeliveryStatusRow['status'], string> = {
  ASSIGNED: '未確認',
  VIEWED: '確認中',
  ACCEPTED: '採用済み',
  DECLINED: '今回は使わない',
  POSTED: '投稿完了',
  EXPIRED: '利用期限切れ',
};

const notificationLabel: Record<VideoDeliveryStatusRow['notificationStatus'], string> = {
  PENDING: '未送信',
  SENT: 'LINEでお知らせ済み',
  FAILED: '送信に失敗',
  CANCELLED: '送信していません',
};

export function VideoDeliveryManager({
  serviceSlug,
  candidates,
  deliveries,
}: {
  serviceSlug: string;
  candidates: VideoDeliveryCandidate[];
  deliveries: VideoDeliveryStatusRow[];
}) {
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>, candidate: VideoDeliveryCandidate) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const expiryValue = data.get('expiresAt');
    const expiresAt =
      typeof expiryValue === 'string' && expiryValue ? new Date(expiryValue).toISOString() : null;
    setSaving(candidate.videoRenderId);
    setMessage('利用できる状態にしています…');
    try {
      const response = await fetch(
        `/api/services/${encodeURIComponent(serviceSlug)}/video-deliveries`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            membershipId: data.get('membershipId'),
            programEnrollmentId: data.get('programEnrollmentId') || null,
            videoProjectId: candidate.videoProjectId,
            videoRenderId: candidate.videoRenderId,
            usageMessage: data.get('usageMessage'),
            expiresAt,
          }),
        },
      );
      const result = (await response.json()) as {
        notification?:
          | 'SENT'
          | 'NOT_CONFIGURED'
          | 'PAUSED'
          | 'NOT_ALLOWED'
          | 'RECIPIENT_UNAVAILABLE'
          | 'QUOTA_UNAVAILABLE'
          | 'FAILED';
        error?: { message?: string };
      };
      if (!response.ok)
        throw new Error(result.error?.message ?? '利用できる状態にできませんでした。');
      setMessage(
        result.notification === 'SENT'
          ? '利用者が確認できる状態にし、公式LINEでお知らせしました。'
          : '利用者が確認できる状態にしました。LINE通知は送られていないため、設定または本人のLINE連携を確認してください。',
      );
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '利用できる状態にできませんでした。');
    } finally {
      setSaving(null);
    }
  }

  async function retryNotification(delivery: VideoDeliveryStatusRow) {
    setSaving(delivery.id);
    setMessage('LINE通知を再送しています…');
    try {
      const response = await fetch(
        `/api/services/${encodeURIComponent(serviceSlug)}/video-deliveries/${encodeURIComponent(delivery.id)}/line-notification/retry`,
        { method: 'POST' },
      );
      const result = (await response.json()) as {
        data?: { notification?: 'SENT' | string };
        error?: { message?: string };
      };
      if (!response.ok)
        throw new Error(result.error?.message ?? 'LINE通知を再送できませんでした。');
      setMessage(
        result.data?.notification === 'SENT'
          ? '公式LINEでお知らせしました。'
          : 'LINE通知は送られていません。設定または本人のLINE連携を確認してください。',
      );
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'LINE通知を再送できませんでした。');
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className="settings-card">
      <h2>完成した個別動画</h2>
      <p>
        ここでは、すでにその参加者のために作られた動画だけを利用できる状態にします。別の参加者へ動画を渡すことはできません。
      </p>
      {candidates.length === 0 ? (
        <p>利用できる状態にする完成動画はまだありません。</p>
      ) : (
        <div className="form-stack">
          {candidates.map((candidate) => (
            <form
              className="settings-card"
              key={candidate.videoRenderId}
              onSubmit={(event) => void submit(event, candidate)}
            >
              <h3>{candidate.title}</h3>
              <p>
                対象の参加者：{candidate.memberName}
                {candidate.completedAt
                  ? ` ／ 完成：${new Date(candidate.completedAt).toLocaleString('ja-JP')}`
                  : ''}
              </p>
              <input name="membershipId" type="hidden" value={candidate.membershipId} />
              <label className="field">
                <span className="field__label">実践プログラム</span>
                <select className="field__control" name="programEnrollmentId" required>
                  <option value="">選んでください</option>
                  {candidate.enrollments.map((enrollment) => (
                    <option key={enrollment.id} value={enrollment.id}>
                      {enrollment.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field__label">利用するときの案内</span>
                <textarea
                  className="field__control"
                  defaultValue="この動画は、このサービスでのSNS投稿に使えます。内容を確認し、ご自身で投稿してください。"
                  maxLength={500}
                  name="usageMessage"
                  required
                />
              </label>
              <label className="field">
                <span className="field__label">利用期限（任意）</span>
                <input className="field__control" name="expiresAt" type="datetime-local" />
                <span className="field__hint">
                  期限を過ぎると、利用者は動画を開いたり投稿完了を記録したりできません。
                </span>
              </label>
              <button
                className="button button--primary"
                disabled={saving === candidate.videoRenderId || candidate.enrollments.length === 0}
                type="submit"
              >
                {saving === candidate.videoRenderId ? '準備しています…' : '利用者に確認してもらう'}
              </button>
              {candidate.enrollments.length === 0 ? (
                <p>この参加者は利用できる実践プログラムに登録されていません。</p>
              ) : null}
            </form>
          ))}
        </div>
      )}
      <p
        aria-live="polite"
        className={message ? 'notice notice--success' : undefined}
        role="status"
      >
        {message}
      </p>
      <section className="settings-card">
        <h2>確認依頼の状況</h2>
        <p>利用者が動画を確認したか、採用したか、投稿したかを確認できます。</p>
        {deliveries.length === 0 ? (
          <p>確認依頼を送った動画はまだありません。</p>
        ) : (
          <div className="form-stack">
            {deliveries.map((delivery) => (
              <article className="settings-card" key={delivery.id}>
                <h3>{delivery.title}</h3>
                <p>対象の参加者：{delivery.memberName}</p>
                <p>
                  状態：<strong>{statusLabel[delivery.status]}</strong>
                </p>
                <p>
                  LINE通知：<strong>{notificationLabel[delivery.notificationStatus]}</strong>
                  {delivery.notificationErrorCode
                    ? `（理由：${delivery.notificationErrorCode}）`
                    : ''}
                </p>
                {delivery.notifiedAt ? (
                  <p>LINE通知の確認：{new Date(delivery.notifiedAt).toLocaleString('ja-JP')}</p>
                ) : null}
                <p>通知の試行回数：{delivery.notificationAttemptCount}回</p>
                {delivery.notificationStatus !== 'SENT' ? (
                  <button
                    className="button button--secondary"
                    disabled={saving === delivery.id}
                    onClick={() => void retryNotification(delivery)}
                    type="button"
                  >
                    {saving === delivery.id ? '再送しています…' : 'LINE通知を再送する'}
                  </button>
                ) : null}
                <p>確認依頼：{new Date(delivery.assignedAt).toLocaleString('ja-JP')}</p>
                {delivery.viewedAt ? (
                  <p>動画を確認：{new Date(delivery.viewedAt).toLocaleString('ja-JP')}</p>
                ) : null}
                {delivery.acceptedAt ? (
                  <p>採用：{new Date(delivery.acceptedAt).toLocaleString('ja-JP')}</p>
                ) : null}
                {delivery.declinedAt ? (
                  <p>今回は使わない：{new Date(delivery.declinedAt).toLocaleString('ja-JP')}</p>
                ) : null}
                {delivery.postedAt ? (
                  <p>投稿完了：{new Date(delivery.postedAt).toLocaleString('ja-JP')}</p>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
