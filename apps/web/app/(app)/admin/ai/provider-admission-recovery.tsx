'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

type Summary = {
  provider: string;
  openCount: number;
  recoverableCount: number;
  reservedCostUsdMicros: number;
  oldestAdmittedAt: string;
};

const usd = (micros: number) => (micros / 1_000_000).toFixed(4);

export function AiProviderAdmissionRecovery(props: {
  initialSummaries: Summary[];
  recoveryScanTruncated: boolean;
  canRecover: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const recoverable = props.initialSummaries.reduce(
    (total, summary) => total + summary.recoverableCount,
    0,
  );

  async function recover(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch('/api/admin/ai-provider-admissions/recover', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: form.get('reason') }),
      });
      const result = (await response.json()) as {
        data?: { scanned: number; recovered: number; remainingOpen: number };
        error?: { message?: string };
      };
      if (!response.ok || !result.data)
        setMessage(result.error?.message ?? '復旧できませんでした。');
      else {
        setMessage(
          `${result.data.recovered}件を復旧しました。未精算は${result.data.remainingOpen}件です。`,
        );
        router.refresh();
      }
    } catch {
      setMessage('通信に失敗しました。画面を再読み込みして、もう一度お試しください。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-card">
      <h2>AI費用の未精算予約</h2>
      <p>
        使用量の保存後に精算だけ失敗した予約を確認します。使用量記録と一致しない予約は解放しません。
      </p>
      {props.initialSummaries.length === 0 ? (
        <p>未精算予約はありません。</p>
      ) : (
        <div className="stack">
          {props.initialSummaries.map((summary) => (
            <div className="settings-card" key={summary.provider}>
              <p>
                <strong>{summary.provider}</strong>：{summary.openCount}件（予約額 $
                {usd(summary.reservedCostUsdMicros)}）
              </p>
              <p>
                記録済み実績で復旧可能：{summary.recoverableCount}件／最古：
                {new Date(summary.oldestAdmittedAt).toLocaleString('ja-JP')}
              </p>
            </div>
          ))}
        </div>
      )}
      {props.recoveryScanTruncated ? (
        <p>復旧候補の表示は古い100件までです。復旧後に再確認してください。</p>
      ) : null}
      {!props.canRecover && recoverable > 0 ? (
        <p>復旧操作は最高管理者だけが実行できます。</p>
      ) : null}
      <form onSubmit={(event) => void recover(event)} className="stack">
        <label>
          復旧理由
          <input name="reason" minLength={3} maxLength={500} required />
        </label>
        <button
          className="button button--secondary"
          disabled={busy || recoverable === 0 || !props.canRecover}
        >
          {busy ? '確認中…' : '記録済み実績だけ復旧する'}
        </button>
      </form>
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
