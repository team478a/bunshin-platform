'use client';

import { useEffect, useState, type FormEvent } from 'react';

type Broadcast = {
  id: string;
  title: string;
  status: string;
  scheduledAt: string | null;
  recipients: Record<string, number>;
};

export function ServiceLineBroadcastEditor({ serviceSlug }: { serviceSlug: string }) {
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const scheduledCount = broadcasts.filter((broadcast) => broadcast.status === 'SCHEDULED').length;
  const failedCount = broadcasts.reduce(
    (total, broadcast) => total + (broadcast.recipients.FAILED ?? 0),
    0,
  );
  const load = async () => {
    const response = await fetch(
      `/api/services/${encodeURIComponent(serviceSlug)}/line-broadcasts`,
    );
    if (response.ok) setBroadcasts(((await response.json()) as { data: Broadcast[] }).data);
  };
  useEffect(() => {
    void load();
  }, [serviceSlug]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    if (!window.confirm('対象者と本文を確認しましたか？ 指定時刻にLINEを一斉送信します。')) return;
    setSending(true);
    setMessage('LINEを送信しています…');
    try {
      const response = await fetch(
        `/api/services/${encodeURIComponent(serviceSlug)}/line-broadcasts`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            title: formData.get('title'),
            message: formData.get('message'),
            reason: formData.get('reason'),
            scheduledAt: formData.get('scheduledAt') || undefined,
            confirmed: true,
          }),
        },
      );
      const result = (await response.json()) as {
        data?: { requested: number; scheduledAt: string };
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(result.error?.message ?? 'LINEを送信できませんでした。');
      setMessage(
        `送信を予約しました。対象 ${result.data?.requested ?? 0}人／予定時刻 ${result.data?.scheduledAt ?? ''}`,
      );
      event.currentTarget.reset();
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'LINEを送信できませんでした。');
    } finally {
      setSending(false);
    }
  }
  return (
    <section className="settings-card">
      <p className="eyebrow">参加者へのお知らせ</p>
      <h2>任意のお知らせを一斉配信</h2>
      <p>LINE連携・通知同意・友だち追加が確認できた、このサービスの参加者だけに送ります。</p>
      <div className="line-broadcast-summary" aria-label="配信の状況">
        <span>
          予約中 <strong>{scheduledCount}件</strong>
        </span>
        <span>
          再送確認 <strong>{failedCount}件</strong>
        </span>
        <span>
          履歴 <strong>{broadcasts.length}件</strong>
        </span>
      </div>
      <form className="admin-form-grid" onSubmit={(event) => void submit(event)}>
        <label>
          件名
          <input name="title" required maxLength={120} placeholder="例：今週のお知らせ" />
        </label>
        <label>
          本文
          <textarea
            name="message"
            required
            maxLength={5000}
            rows={7}
            placeholder="送信する内容を入力してください"
          />
        </label>
        <label>
          送信理由
          <input name="reason" required maxLength={1000} placeholder="例：公式のお知らせ" />
        </label>
        <label>
          送信予定（空欄なら今すぐ）
          <input name="scheduledAt" type="datetime-local" />
        </label>
        <button className="button" disabled={sending} type="submit">
          {sending ? '予約中…' : '内容を確認して送信を予約する'}
        </button>
      </form>
      <p aria-live="polite" role="status">
        {message}
      </p>
      <h3>最近の配信</h3>
      <p>
        <a href={`/api/services/${encodeURIComponent(serviceSlug)}/line-broadcasts/export`}>
          配信結果をCSVでダウンロード
        </a>
      </p>
      <ul className="line-broadcast-list">
        {broadcasts.map((broadcast) => (
          <li key={broadcast.id}>
            {broadcast.title}（{broadcast.status}／送信 {broadcast.recipients.SENT ?? 0}件／失敗{' '}
            {broadcast.recipients.FAILED ?? 0}件）
            {(broadcast.recipients.FAILED ?? 0) > 0 ? (
              <button
                className="button button--secondary"
                type="button"
                onClick={() => {
                  const reason = window.prompt('再送する理由を入力してください');
                  if (!reason) return;
                  void fetch(
                    `/api/services/${encodeURIComponent(serviceSlug)}/line-broadcasts/${broadcast.id}/retry`,
                    {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({ reason }),
                    },
                  ).then(() => load());
                }}
              >
                失敗分を再送する
              </button>
            ) : null}
            {broadcast.status === 'SCHEDULED' ? (
              <button
                className="button button--secondary"
                type="button"
                onClick={() => {
                  const reason = window.prompt('取り消す理由を入力してください');
                  if (!reason || !window.confirm('まだ送っていない相手への配信を取り消します。'))
                    return;
                  void fetch(
                    `/api/services/${encodeURIComponent(serviceSlug)}/line-broadcasts/${broadcast.id}/cancel`,
                    {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({ reason }),
                    },
                  ).then(async (response) => {
                    setMessage(
                      response.ok
                        ? '予約した配信を取り消しました。'
                        : '配信を取り消せませんでした。',
                    );
                    await load();
                  });
                }}
              >
                配信を取り消す
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
