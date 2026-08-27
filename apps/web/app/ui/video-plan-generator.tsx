'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function VideoPlanGenerator({
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
  const [message, setMessage] = useState('');
  const [generating, setGenerating] = useState(false);

  async function generate() {
    setGenerating(true);
    setMessage('分身が動画の流れと台本を考えています…');
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceId}/groups/${groupId}/video-projects/${projectId}/generate`,
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
        throw new Error(result.error?.message ?? '台本を作れませんでした。');
      setMessage('台本ができました。内容を確認してください。');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '台本を作れませんでした。');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <section className="settings-card">
      <h2>{revision === 1 ? '動画の台本を作る' : '台本を作り直す'}</h2>
      <p>AIが分身の話し方、紹介する相手、許可された商品と素材だけを使って提案します。</p>
      <button
        className="button"
        type="button"
        disabled={generating}
        onClick={() => void generate()}
      >
        {generating
          ? '考えています…'
          : revision === 1
            ? '台本を作ってもらう'
            : '別の台本を作ってもらう'}
      </button>
      <p role="status" aria-live="polite">
        {message}
      </p>
    </section>
  );
}
