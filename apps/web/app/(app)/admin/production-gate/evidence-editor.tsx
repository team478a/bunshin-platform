'use client';
import { useMemo, useState, type FormEvent } from 'react';

const checks = [
  ['BACKUP_RESTORE', 'バックアップから元に戻せること'],
  ['MIGRATION_HEALTH', 'データ更新と健康確認'],
  ['AUTH_SMOKE', 'LINE・メールのログイン確認'],
  ['FREE_MVP_SMOKE', 'スマートフォンで投稿完了まで確認'],
  ['ACCOUNT_DELETION_DRY_RUN', '退会処理の予行練習'],
  ['LINE_GO_NO_GO', 'LINE配信を始めてよいかの確認'],
  ['FINAL_APPROVAL', '責任者の最終承認'],
] as const;
type CheckKey = (typeof checks)[number][0];
type Evidence = {
  id: string;
  checkKey: CheckKey;
  action: 'RECORDED' | 'REVOKED';
  reason: string;
  evidenceUrl: string | null;
  occurredAt: string;
};

export function ProductionGateEvidenceEditor({
  initialEvidence,
  commitSha,
}: {
  initialEvidence: Evidence[];
  commitSha: string;
}) {
  const [events, setEvents] = useState(initialEvidence);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const latest = useMemo(() => new Map(events.map((event) => [event.checkKey, event])), [events]);

  async function submit(event: FormEvent<HTMLFormElement>, checkKey: CheckKey) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const current = latest.get(checkKey);
    setBusy(true);
    setError('');
    const response = await fetch('/api/admin/production-gate-evidence', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        checkKey,
        action: current?.action === 'RECORDED' ? 'REVOKED' : 'RECORDED',
        reason: form.get('reason'),
        evidenceUrl: form.get('evidenceUrl'),
      }),
    });
    const value = (await response.json()) as { data?: Evidence; error?: { message?: string } };
    if (!response.ok || !value.data) setError(value.error?.message ?? '保存できませんでした。');
    else {
      setEvents((items) => [...items, value.data as Evidence]);
      event.currentTarget.reset();
    }
    setBusy(false);
  }

  return (
    <section className="settings-card">
      <h2>対象の本番版</h2>
      <p>
        <code>{commitSha}</code>
      </p>
      <p>別の版を公開すると確認は引き継がれません。秘密情報や利用者情報は入力しないでください。</p>
      {error ? (
        <p className="danger" role="alert">
          {error}
        </p>
      ) : null}
      <ul>
        {checks.map(([key, label]) => {
          const current = latest.get(key);
          const recorded = current?.action === 'RECORDED';
          return (
            <li key={key}>
              <h3>{label}</h3>
              <p>
                <strong className={recorded ? 'status-success' : 'status-warning'}>
                  {recorded ? '確認済み' : '未確認'}
                </strong>
              </p>
              {current ? (
                <p>
                  最終更新: {new Date(current.occurredAt).toLocaleString('ja-JP')} —{' '}
                  {current.reason}
                </p>
              ) : null}
              <form onSubmit={(event) => void submit(event, key)}>
                <label>
                  確認内容・変更理由
                  <input name="reason" required minLength={10} maxLength={1000} />
                </label>
                <label>
                  証跡URL（任意）
                  <input name="evidenceUrl" type="url" placeholder="https://github.com/..." />
                </label>
                <button disabled={busy} type="submit">
                  {recorded ? '確認を取り消す' : '確認済みにする'}
                </button>
              </form>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
