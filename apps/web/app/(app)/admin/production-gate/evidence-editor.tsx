'use client';
import { currentProductionGateRecordedChecks } from '@bunshin/application';
import { useMemo, useState, type FormEvent } from 'react';

const checks = [
  ['BACKUP_RESTORE', 'バックアップから元に戻せること', []],
  ['MIGRATION_HEALTH', 'データ更新と健康確認', []],
  ['AUTH_SMOKE', 'LINE・メールのログイン確認', []],
  ['FREE_MVP_SMOKE', 'スマートフォンで投稿完了まで確認', []],
  ['ACCOUNT_DELETION_DRY_RUN', '退会処理の予行練習', []],
  ['LINE_GO_NO_GO', 'LINE配信を始めてよいかの確認', []],
  ['TREND_RESEARCH_SMOKE', '話題調査が本番で正しく動くこと', []],
  ['EXTERNAL_TRACKING_SMOKE', '専用URLが正しく安全に入ること', []],
  [
    'DAILY_MISSION_LINE_SMOKE',
    '今日やることを共通LINEで受け取る',
    [
      'テスト参加者のiPhoneで「今日やること」を開く',
      '今日の投稿案を1件作り、共通LINEに案内が届くことを確認する',
      'LINEの案内を開き、作った投稿案と同じ内容が表示されることを確認する',
    ],
  ],
  [
    'TRACKING_LINK_NOTIFICATION_SMOKE',
    '専用URLの開始・修正通知を受け取る',
    [
      'テスト参加者の専用URLを使用開始し、本人のLINEに案内が届くことを確認する',
      '同じ専用URLへ修正依頼を出し、本人のLINEに修正案内が届くことを確認する',
      '別の参加者にはURLと通知内容が表示されないことを確認する',
    ],
  ],
  [
    'REFERRAL_SHARE_SMOKE',
    '紹介URLをLINE共有・QR読取する',
    [
      '紹介画面からLINE共有を行い、送信先で正しい参加画面が開くことを確認する',
      '表示したQRコードを別端末で読み取り、同じ参加画面が開くことを確認する',
      '参加後、紹介元の記録へ正しく反映されることを確認する',
    ],
  ],
  [
    'DUPLICATE_PREVENTION_SMOKE',
    '同じ日の重複作成・重複配信がない',
    [
      '同じ参加者・サービス・日付を対象に定期処理を2回実行する',
      '「今日やること」が1件だけであることを確認する',
      '共通LINEの案内も1件だけであることを確認する',
    ],
  ],
  ['FINAL_APPROVAL', '責任者の最終承認', []],
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
  const recordedChecks = useMemo(() => currentProductionGateRecordedChecks(events), [events]);
  const requiredKeys = checks.filter(([key]) => key !== 'FINAL_APPROVAL').map(([key]) => key);
  const completedRequired = requiredKeys.filter((key) => recordedChecks.has(key)).length;
  const remainingRequired = requiredKeys.length - completedRequired;

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
      <p>
        <strong className={remainingRequired === 0 ? 'status-success' : 'status-warning'}>
          最終承認まで：{completedRequired}/{requiredKeys.length}項目を確認済み
        </strong>
      </p>
      {error ? (
        <p className="danger" role="alert">
          {error}
        </p>
      ) : null}
      <ul>
        {checks.map(([key, label, steps]) => {
          const current = latest.get(key);
          const recorded = recordedChecks.has(key);
          const finalBlocked = key === 'FINAL_APPROVAL' && !recorded && remainingRequired > 0;
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
              {finalBlocked ? (
                <p className="status-warning">
                  先に残り{remainingRequired}項目を確認してください。
                </p>
              ) : null}
              <form onSubmit={(event) => void submit(event, key)}>
                {!recorded && steps.length > 0 ? (
                  <fieldset>
                    <legend>確認すること</legend>
                    {steps.map((step, index) => (
                      <label key={step}>
                        <input name={`${key}-${index}`} type="checkbox" required /> {step}
                      </label>
                    ))}
                  </fieldset>
                ) : null}
                <label>
                  確認内容・変更理由
                  <input name="reason" required minLength={10} maxLength={1000} />
                </label>
                <label>
                  証跡URL（任意）
                  <input name="evidenceUrl" type="url" placeholder="https://github.com/..." />
                </label>
                <button disabled={busy || finalBlocked} type="submit">
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
