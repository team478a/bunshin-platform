'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function VideoPlanApprover({
  workspaceId,
  groupId,
  projectId,
  revision,
}: {
  workspaceId: string;
  groupId: string;
  projectId: string;
  revision: number;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function approve() {
    setSaving(true);
    setMessage('確認内容を保存しています…');
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceId}/groups/${groupId}/video-projects/${projectId}/approve`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ expectedRevision: revision }),
        },
      );
      const result = (await response.json()) as {
        data?: { id?: string };
        error?: { message?: string };
      };
      if (!response.ok || !result.data?.id)
        throw new Error(result.error?.message ?? '確認内容を保存できませんでした。');
      setMessage('台本を確認済みにしました。動画本体の作成準備ができています。');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '確認内容を保存できませんでした。');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="form-stack">
      <button className="button" type="button" disabled={saving} onClick={() => void approve()}>
        {saving ? '保存中…' : 'この台本で進める'}
      </button>
      <p role="status" aria-live="polite">
        {message}
      </p>
    </div>
  );
}
