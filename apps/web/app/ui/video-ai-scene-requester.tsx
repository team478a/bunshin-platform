'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function VideoAiSceneRequester(props: {
  workspaceId: string;
  groupId: string;
  projectId: string;
  revision: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit() {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(
        `/api/workspaces/${props.workspaceId}/groups/${props.groupId}/video-projects/${props.projectId}/ai-scenes`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ expectedRevision: props.revision, provider: 'FAL' }),
        },
      );
      const result = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(result.error?.message ?? 'AI動画を始められませんでした。');
      setMessage('AI動画の場面づくりを受け付けました。完成まで少しお待ちください。');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'AI動画を始められませんでした。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form-stack">
      <button
        className="button button--primary"
        type="button"
        disabled={busy}
        onClick={() => void submit()}
      >
        {busy ? '受け付けています…' : 'この内容でAI動画を作る'}
      </button>
      <p role="status" aria-live="polite">
        {message}
      </p>
    </div>
  );
}
