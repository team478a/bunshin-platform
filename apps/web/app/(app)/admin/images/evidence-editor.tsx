'use client';
import { useMemo, useState, type FormEvent } from 'react';

const checks = [
  ['PLAN_APPROVAL', '試験内容と予算の承認'],
  ['STORAGE_RETENTION', '画像の保存期間と削除方法の確認'],
  ['MOBILE_E2E', 'スマートフォンで作成から保存まで確認'],
  ['SECURITY_ISOLATION', 'ほかのグループや参加者の画像が見えないことを確認'],
  ['TEN_THEME_VALIDATION', '10種類以上のテーマで品質を確認'],
  ['FINAL_APPROVAL', '責任者による開始の最終承認'],
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

export function ImagePilotEvidenceEditor({
  workspaceId,
  groupId,
  pilotId,
  canEdit,
  initialEvidence,
}: {
  workspaceId: string;
  groupId: string;
  pilotId: string;
  canEdit: boolean;
  initialEvidence: Evidence[];
}) {
  const [events, setEvents] = useState(initialEvidence);
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState<CheckKey | null>(null);
  const latest = useMemo(() => new Map(events.map((event) => [event.checkKey, event])), [events]);
  const prerequisitesReady = checks
    .slice(0, -1)
    .every(([key]) => latest.get(key)?.action === 'RECORDED');

  async function submit(event: FormEvent<HTMLFormElement>, checkKey: CheckKey) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const current = latest.get(checkKey);
    setBusyKey(checkKey);
    setError('');
    const response = await fetch('/api/admin/image-pilot-evidence', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        workspaceId,
        groupId,
        pilotId,
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
    setBusyKey(null);
  }

  return (
    <section className="settings-card">
      <h2>開始前に人が確認すること</h2>
      <p>
        実際に確認した項目だけを記録してください。最終承認は、上の5項目がすべて確認済みの場合だけ記録できます。
      </p>
      <p>秘密情報、利用者の個人情報、画像の中身は入力しないでください。</p>
      {error ? (
        <p className="notice notice--danger" role="alert">
          {error}
        </p>
      ) : null}
      <ul className="admin-check-list">
        {checks.map(([key, label]) => {
          const current = latest.get(key);
          const recorded = current?.action === 'RECORDED';
          const finalBlocked = key === 'FINAL_APPROVAL' && !recorded && !prerequisitesReady;
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
                  最終更新：{new Date(current.occurredAt).toLocaleString('ja-JP')} —{' '}
                  {current.reason}
                </p>
              ) : null}
              {finalBlocked ? <p>先に上の5項目を確認してください。</p> : null}
              {canEdit ? (
                <form className="form-stack" onSubmit={(event) => void submit(event, key)}>
                  <label className="field">
                    <span className="field__label">確認した内容・取り消す理由</span>
                    <input
                      className="field__control"
                      name="reason"
                      required
                      minLength={10}
                      maxLength={1000}
                    />
                  </label>
                  <label className="field">
                    <span className="field__label">確認資料のURL（任意）</span>
                    <input
                      className="field__control"
                      name="evidenceUrl"
                      type="url"
                      placeholder="https://github.com/..."
                    />
                  </label>
                  <button
                    className="button"
                    disabled={busyKey !== null || finalBlocked}
                    type="submit"
                  >
                    {busyKey === key ? '保存中…' : recorded ? '確認を取り消す' : '確認済みにする'}
                  </button>
                </form>
              ) : null}
            </li>
          );
        })}
      </ul>
      {!canEdit ? <p>確認内容の変更は最高管理者が行います。</p> : null}
    </section>
  );
}
