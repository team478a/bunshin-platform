'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function DeferRefinementButton({
  serviceSlug,
  question,
  disabled = false,
}: {
  serviceSlug: string;
  question: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);

  async function defer() {
    if (pending || done) return;
    setPending(true);
    setMessage('');
    try {
      const response = await fetch(
        `/api/services/${encodeURIComponent(serviceSlug)}/onboarding/refinement`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ question }),
        },
      );
      if (!response.ok) {
        setMessage(
          response.status === 409
            ? '質問が更新されました。画面を開き直してください。'
            : '見送りを保存できませんでした。もう一度お試しください。',
        );
        return;
      }
      setDone(true);
      router.replace(`/s/${encodeURIComponent(serviceSlug)}/home`);
      router.refresh();
    } catch {
      setMessage('通信できませんでした。接続を確認して、もう一度お試しください。');
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        className="button button--secondary button--full"
        disabled={disabled || pending || done}
        onClick={() => void defer()}
      >
        {pending ? '保存しています…' : done ? '見送りました' : 'あとで答える'}
      </button>
      <p>この質問は7日間表示しません。設定からいつでも回答できます。</p>
      {message && <p role="alert">{message}</p>}
    </div>
  );
}
