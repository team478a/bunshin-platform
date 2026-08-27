'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

export function VideoRenderRetryForm({ renderId }: { renderId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const value = new FormData(form).get('reason');
    const reason = typeof value === 'string' ? value.trim() : '';
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/admin/video-renders/${renderId}/retry`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const result = (await response.json()) as { error?: { message?: string } };
      if (response.ok) {
        setMessage('再実行を受け付けました。');
        form.reset();
        router.refresh();
      } else setMessage(result.error?.message ?? '再実行を受け付けられませんでした。');
    } catch {
      setMessage('通信できませんでした。時間をおいて、もう一度お試しください。');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={(event) => void submit(event)}>
      <label>
        再実行する理由
        <input name="reason" required minLength={3} maxLength={500} />
      </label>
      <button type="submit" disabled={busy}>
        {busy ? '受付中…' : '理由を記録して再実行'}
      </button>
      <p role="status">{message}</p>
    </form>
  );
}
