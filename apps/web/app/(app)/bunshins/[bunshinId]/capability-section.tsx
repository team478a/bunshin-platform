'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export type SocialCapabilityStatus = 'ACTIVE' | 'SUSPENDED' | 'LOCKED' | null;

const labels: Record<Exclude<SocialCapabilityStatus, null>, string> = {
  ACTIVE: '有効',
  SUSPENDED: '停止中',
  LOCKED: 'ロック中',
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
        ? 'SOCIAL Capabilityの状態を更新しました。'
        : 'SOCIAL Capabilityの状態を更新できませんでした。',
    );
    if (response.ok) router.refresh();
  }

  return (
    <section className="capability-section">
      <h2>Capability</h2>
      <div className="capability-card">
        <div>
          <h3>SOCIAL</h3>
          <p>
            状態: <strong>{socialStatus === null ? '未割当' : labels[socialStatus]}</strong>
          </p>
          <p>投稿機能は後続Phaseで提供します。この設定だけでは投稿されません。</p>
        </div>
        {socialStatus === null ? (
          <button type="button" disabled={pending} onClick={() => void mutate('assign')}>
            SOCIALを割り当てる
          </button>
        ) : socialStatus === 'ACTIVE' ? (
          <button type="button" disabled={pending} onClick={() => void mutate('suspend')}>
            停止する
          </button>
        ) : socialStatus === 'SUSPENDED' ? (
          <button type="button" disabled={pending} onClick={() => void mutate('activate')}>
            再有効化する
          </button>
        ) : null}
      </div>
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
