'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function VideoRenderRequester(props: {
  workspaceId: string;
  groupId: string;
  projectId: string;
  revision: number;
}) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(
        `/api/workspaces/${props.workspaceId}/groups/${props.groupId}/video-projects/${props.projectId}/render`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ expectedRevision: props.revision }),
        },
      );
      if (!response.ok) throw new Error('request failed');
      setMessage('動画づくりを受け付けました。完成まで少しお待ちください。');
      router.refresh();
    } catch {
      setMessage('動画づくりを始められませんでした。管理者へお問い合わせください。');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <button
        className="button button--primary"
        type="button"
        disabled={busy}
        onClick={() => void submit()}
      >
        {busy ? '受け付けています…' : 'この内容で動画を作る'}
      </button>
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
}
