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

export function VideoDeliveryManager({
  serviceSlug,
  candidates,
}: {
  serviceSlug: string;
  candidates: VideoDeliveryCandidate[];
}) {
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>, candidate: VideoDeliveryCandidate) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
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
            expiresAt: null,
          }),
        },
      );
      const result = (await response.json()) as { error?: { message?: string } };
      if (!response.ok)
        throw new Error(result.error?.message ?? '利用できる状態にできませんでした。');
      setMessage('利用者が確認できる状態にしました。');
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '利用できる状態にできませんでした。');
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
    </section>
  );
}
