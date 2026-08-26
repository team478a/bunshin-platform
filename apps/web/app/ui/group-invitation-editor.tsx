'use client';

import { useState, type FormEvent } from 'react';

export function GroupInvitationEditor({
  workspaceId,
  groupId,
}: {
  workspaceId: string;
  groupId: string;
}) {
  const [message, setMessage] = useState('');
  const [invitationUrl, setInvitationUrl] = useState('');
  const [saving, setSaving] = useState(false);

  async function createInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const role = new FormData(form).get('role');
    if (role !== 'MANAGER' && role !== 'PARTICIPANT') return;
    setSaving(true);
    setMessage('招待リンクを作っています…');
    setInvitationUrl('');
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/groups/${groupId}/invitations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const result = (await response.json()) as {
        data?: { invitationUrl?: string };
        error?: { message?: string };
      };
      if (!response.ok || !result.data?.invitationUrl)
        throw new Error(result.error?.message ?? '招待リンクを作成できませんでした。');
      setInvitationUrl(result.data.invitationUrl);
      setMessage('招待リンクを作成しました。7日以内に1人だけ参加できます。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '招待リンクを作成できませんでした。');
    } finally {
      setSaving(false);
    }
  }

  async function copyInvitation() {
    if (!invitationUrl) return;
    try {
      await navigator.clipboard.writeText(invitationUrl);
      setMessage('招待リンクをコピーしました。招待する本人へ安全な方法で送ってください。');
    } catch {
      setMessage('自動でコピーできませんでした。表示されたリンクを選んでコピーしてください。');
    }
  }

  return (
    <section className="settings-card">
      <h2>人を招待する</h2>
      <p>役割を選び、1人だけが使える7日間有効の招待リンクを作ります。</p>
      <form className="form-stack" onSubmit={(event) => void createInvitation(event)}>
        <label className="field">
          <span className="field__label">招待する人の役割</span>
          <select className="field__control" name="role" defaultValue="PARTICIPANT">
            <option value="PARTICIPANT">参加者</option>
            <option value="MANAGER">グループ管理者</option>
          </select>
        </label>
        <button className="button" type="submit" disabled={saving}>
          {saving ? '作成中…' : '招待リンクを作る'}
        </button>
      </form>
      <p role="status" aria-live="polite">
        {message}
      </p>
      {invitationUrl ? (
        <div className="form-stack">
          <label className="field">
            <span className="field__label">今回だけ表示される招待リンク</span>
            <input className="field__control" value={invitationUrl} readOnly />
          </label>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => void copyInvitation()}
          >
            招待リンクをコピー
          </button>
          <p>このリンクを管理画面や公開ページへ貼らないでください。</p>
        </div>
      ) : null}
    </section>
  );
}
