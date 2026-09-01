'use client';

import { useState, type FormEvent } from 'react';

export function ServiceLineBroadcastEditor({ serviceSlug }: { serviceSlug: string }) {
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    if (!window.confirm('対象者と本文を確認しましたか？ この操作でLINEを一斉送信します。')) return;
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
            confirmed: true,
          }),
        },
      );
      const result = (await response.json()) as {
        data?: { requested: number; sent: number; failed: number };
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(result.error?.message ?? 'LINEを送信できませんでした。');
      setMessage(
        `送信しました。対象 ${result.data?.requested ?? 0}人／成功 ${result.data?.sent ?? 0}人／失敗 ${result.data?.failed ?? 0}人`,
      );
      event.currentTarget.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'LINEを送信できませんでした。');
    } finally {
      setSending(false);
    }
  }
  return (
    <section className="settings-card">
      <h2>任意のお知らせを一斉配信</h2>
      <p>LINE連携・通知同意・友だち追加が確認できた、このサービスの参加者だけに送ります。</p>
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
        <button disabled={sending} type="submit">
          {sending ? '送信中…' : '内容を確認して一斉送信する'}
        </button>
      </form>
      <p aria-live="polite" role="status">
        {message}
      </p>
    </section>
  );
}
