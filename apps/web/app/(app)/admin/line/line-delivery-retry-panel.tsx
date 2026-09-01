'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

type Failure = {
  deliveryId: string;
  kind: 'MISSION' | 'BADGE';
  category: string;
  attemptCount: number;
  failedAt: string;
};

export function LineDeliveryRetryPanel({
  failures,
  endpointPrefix = '/api/admin',
}: {
  failures: Failure[];
  endpointPrefix?: string;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  async function retry(event: FormEvent<HTMLFormElement>, deliveryId: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const reasonValue = new FormData(form).get('reason');
    const reason = typeof reasonValue === 'string' ? reasonValue.trim() : '';
    setBusyId(deliveryId);
    setMessage('');
    const kind = failures.find((failure) => failure.deliveryId === deliveryId)?.kind;
    const endpoint =
      kind === 'BADGE'
        ? `/api/admin/badge-line-deliveries/${deliveryId}/retry`
        : `${endpointPrefix}/line-deliveries/${deliveryId}/retry`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    const result = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) setMessage(result.error?.message ?? '再送を登録できませんでした。');
    else {
      setMessage('再送Jobを登録しました。');
      form.reset();
      router.refresh();
    }
    setBusyId(null);
  }

  return (
    <section aria-labelledby="line-retry-heading">
      <h2 id="line-retry-heading">再送可能な失敗</h2>
      <p>同じ失敗回は一度だけ再送できます。理由は監査履歴へ保存されます。</p>
      {failures.length === 0 ? (
        <p>現在、再送できる失敗はありません。</p>
      ) : (
        <ul>
          {failures.map((failure) => (
            <li key={failure.deliveryId}>
              <p>
                {failure.kind === 'BADGE' ? 'バッジ獲得通知' : '今日やることの通知'} /{' '}
                {failure.category} / 試行 {failure.attemptCount}回 /{' '}
                {new Date(failure.failedAt).toLocaleString('ja-JP')}
              </p>
              <form onSubmit={(event) => void retry(event, failure.deliveryId)}>
                <label>
                  再送理由
                  <input name="reason" required minLength={3} maxLength={500} />
                </label>{' '}
                <button type="submit" disabled={busyId !== null}>
                  {busyId === failure.deliveryId ? '登録中…' : '理由を記録して再送'}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <p role="status">{message}</p>
    </section>
  );
}
