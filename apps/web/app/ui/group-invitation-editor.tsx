'use client';

import { useState, type FormEvent } from 'react';

export function GroupInvitationEditor({
  workspaceId,
  groupId,
  serviceSlug,
}: {
  workspaceId: string;
  groupId: string;
  serviceSlug?: string | undefined;
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
        body: JSON.stringify({ role, ...(serviceSlug ? { serviceSlug } : {}) }),
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
    <section className="settings-card invitation-card">
      <div className="invitation-card__heading">
        <div>
          <p className="eyebrow">最初に行うこと</p>
          <h2>参加者・運営者を招待する</h2>
        </div>
        <span className="invitation-card__badge">1人ずつ安全に招待</span>
      </div>
      <p>
        役割を選んで招待リンクを作り、その人だけに送ります。リンクは7日間だけ、1人だけが使えます。
      </p>
      <ol className="invitation-card__steps">
        <li>招待する人の役割を選ぶ</li>
        <li>招待リンクを作る</li>
        <li>LINEやメールで本人に送る</li>
      </ol>
      <form className="form-stack" onSubmit={(event) => void createInvitation(event)}>
        <label className="field">
          <span className="field__label">招待する人の役割</span>
          <select className="field__control" name="role" defaultValue="PARTICIPANT">
            <option value="PARTICIPANT">参加者</option>
            <option value="MANAGER">{serviceSlug ? 'サービス管理者' : 'グループ管理者'}</option>
          </select>
        </label>
        <button className="button button--primary" type="submit" disabled={saving}>
          {saving ? '作成中…' : '招待リンクを作る'}
        </button>
      </form>
      {message ? (
        <p className="notice notice--success" role="status" aria-live="polite">
          {message}
        </p>
      ) : null}
      {invitationUrl ? (
        <div className="form-stack invitation-card__result">
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
          <p>このリンクは公開ページや管理画面には貼らず、招待する本人だけに送ってください。</p>
        </div>
      ) : null}
    </section>
  );
}
