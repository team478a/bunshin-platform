'use client';

import { useId, useState } from 'react';
import { AiTrainingDataDeletionCard } from './ai-training-data-deletion-card';

export function AiTrainingDataExportCard({
  serviceSlug,
  programEnrollmentId,
  programName,
}: {
  serviceSlug: string;
  programEnrollmentId: string;
  programName?: string;
}) {
  const headingId = useId();
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');

  async function download() {
    if (!confirmed || pending) return;
    setPending(true);
    setMessage('');
    try {
      const response = await fetch(
        `/api/services/${encodeURIComponent(serviceSlug)}/ai-training/enrollments/${encodeURIComponent(programEnrollmentId)}/personal-data/export`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
          signal: AbortSignal.timeout(30_000),
        },
      );
      if (!response.ok) {
        setMessage(
          response.status === 413
            ? 'データ量が多いため、一括保存できません。運営者へお問い合わせください。'
            : '保存できませんでした。ログイン状態を確認して、もう一度お試しください。',
        );
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `ai-training-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      try {
        anchor.click();
      } finally {
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      setMessage('保存を開始しました。端末のダウンロードやファイル一覧を確認してください。');
    } catch {
      setMessage('通信できませんでした。接続を確認して、もう一度お試しください。');
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <section className="service-entry__card" aria-labelledby={headingId}>
        <h2 id={headingId}>
          {programName ? `${programName}のデータを保存する` : '自分の研修データを保存する'}
        </h2>
        <p>
          この研修の回答・AI評価・仕事情報・Toolkit・学習進捗を、JSONファイルで保存できます。データは削除されません。
        </p>
        <p>回答や仕事情報を含むため、共有端末への保存や他の人への送付にご注意ください。</p>
        <label>
          <input
            type="checkbox"
            checked={confirmed}
            disabled={pending}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          自分の端末に保存し、ファイルを安全に管理します
        </label>
        <button
          type="button"
          className="button button--secondary button--full"
          disabled={!confirmed || pending}
          onClick={() => void download()}
        >
          {pending ? 'ファイルを準備しています…' : '研修データをダウンロード'}
        </button>
        {message && (
          <p role="status" aria-live="polite">
            {message}
          </p>
        )}
      </section>
      <AiTrainingDataDeletionCard
        serviceSlug={serviceSlug}
        programEnrollmentId={programEnrollmentId}
      />
    </>
  );
}
