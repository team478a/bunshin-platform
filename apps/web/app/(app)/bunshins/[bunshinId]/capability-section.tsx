'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export type SocialCapabilityStatus = 'ACTIVE' | 'SUSPENDED' | 'LOCKED' | null;

const labels: Record<Exclude<SocialCapabilityStatus, null>, string> = {
  ACTIVE: '使えます',
  SUSPENDED: 'お休み中です',
  LOCKED: '今は使えません',
};

export function CapabilitySection({
  workspaceId,
  bunshinId,
  socialStatus,
}: {
  workspaceId: string;
  bunshinId: string;
  socialStatus: SocialCapabilityStatus;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const endpoint = `/api/workspaces/${encodeURIComponent(workspaceId)}/bunshins/${encodeURIComponent(bunshinId)}/capabilities`;

  async function mutate(action: 'assign' | 'activate' | 'suspend') {
    setPending(true);
    setMessage(null);
    const response = await fetch(action === 'assign' ? endpoint : `${endpoint}/SOCIAL/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: action === 'assign' ? JSON.stringify({ capabilityType: 'SOCIAL' }) : '{}',
    });
    setPending(false);
    setMessage(
      response.ok
        ? 'SNSのお手伝い設定を変えました。'
        : '設定を変えられませんでした。もう一度お試しください。',
    );
    if (response.ok) router.refresh();
  }

  return (
    <section className="capability-section">
      <h2>SNSのお手伝い</h2>
      <div className="capability-card">
        <div>
          <h3>SNSの投稿をいっしょに考える</h3>
          <p>
            今の状態：
            <strong>{socialStatus === null ? 'まだ始めていません' : labels[socialStatus]}</strong>
          </p>
          <p>
            BUNSHINが「何を投稿するか」をいっしょに考えます。あなたの許可なく、勝手に投稿することはありません。
          </p>
        </div>
        {socialStatus === null ? (
          <button type="button" disabled={pending} onClick={() => void mutate('assign')}>
            SNSのお手伝いをはじめる
          </button>
        ) : socialStatus === 'ACTIVE' ? (
          <button type="button" disabled={pending} onClick={() => void mutate('suspend')}>
            停止する
          </button>
        ) : socialStatus === 'SUSPENDED' ? (
          <button type="button" disabled={pending} onClick={() => void mutate('activate')}>
            もう一度はじめる
          </button>
        ) : null}
      </div>
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
