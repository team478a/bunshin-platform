'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientRequestId } from '../../../../ui/client-request-id';

export function ServiceDeliverySettings(props: {
  serviceSlug: string;
  bunshinId: string;
  enabled: boolean;
  localTime: string;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(props.enabled);
  const [localTime, setLocalTime] = useState(props.localTime);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        const requestId = createClientRequestId();
        try {
          const response = await fetch(
            `/api/services/${encodeURIComponent(props.serviceSlug)}/bunshins/${encodeURIComponent(props.bunshinId)}/automatic-delivery`,
            {
              method: 'POST',
              headers: { 'content-type': 'application/json', 'x-request-id': requestId },
              body: JSON.stringify({ enabled, localTime }),
            },
          );
          if (!response.ok) throw new Error();
          setMessage('お届け設定を保存しました。');
          router.refresh();
        } catch {
          setMessage(`設定を保存できませんでした。（受付番号: ${requestId}）`);
        } finally {
          setPending(false);
        }
      }}
    >
      <h2>自動のお届け設定</h2>
      <label>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        LINEで投稿案を受け取ることに同意する
      </label>
      <label>
        受け取る時刻（日本時間）
        <input
          type="time"
          min="07:00"
          max="20:59"
          required
          value={localTime}
          onChange={(event) => setLocalTime(event.target.value)}
        />
      </label>
      <button disabled={pending} type="submit">
        お届け設定を保存
      </button>
      {message ? <p role="status">{message}</p> : null}
    </form>
  );
}
