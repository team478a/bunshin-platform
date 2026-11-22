'use client';
import { useState } from 'react';
import './referral-management.css';
import type { ReferralManagementOverview } from '@bunshin/application';
import type { SocialServiceReferralQualificationRule } from '@bunshin/capability-social';
type SocialConditions = Pick<
  SocialServiceReferralQualificationRule,
  | 'requireNewRegistration'
  | 'requireOnboarding'
  | 'requireFirstUserGeneration'
  | 'minimumActiveDays'
>;

function japanDate(value: unknown) {
  return typeof value === 'number'
    ? new Date(value + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
    : '';
}

export function ReferralManagementEditor({
  serviceSlug,
  initial,
}: {
  serviceSlug: string;
  initial: ReferralManagementOverview;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [reason, setReason] = useState('');
  const [authority, setAuthority] = useState<'HEADQUARTERS' | 'SERVICE'>(
    initial.canSetHeadquartersPolicy ? 'HEADQUARTERS' : 'SERVICE',
  );
  const fortune = initial.profile === 'FORTUNE_REFERRAL';
  const firstConditions =
    initial.profile === 'FORTUNE_REFERRAL' ? initial.policy?.conditions : undefined;
  const [fortuneConditions, setFortuneConditions] = useState({
    requireFirstFreeReading: firstConditions?.['requireFirstFreeReading'] !== false,
    minimumActiveDays: Number(firstConditions?.['minimumActiveDays'] ?? 0),
    minimumPaidPurchases: Number(firstConditions?.['minimumPaidPurchases'] ?? 0),
    startsOn: japanDate(firstConditions?.['registeredFrom']),
    endsBefore: japanDate(firstConditions?.['registeredBefore']),
  });
  const { startsOn, endsBefore, ...fortuneThresholds } = fortuneConditions;
  const savedFortuneConditions = {
    ...fortuneThresholds,
    ...(startsOn ? { registeredFrom: Date.parse(`${startsOn}T00:00:00+09:00`) } : {}),
    ...(endsBefore ? { registeredBefore: Date.parse(`${endsBefore}T00:00:00+09:00`) } : {}),
  };
  const [conditions, setConditions] = useState<SocialConditions>(
    (initial.policy?.conditions as SocialConditions | undefined) ?? {
      requireNewRegistration: true,
      requireOnboarding: true,
      requireFirstUserGeneration: true,
      minimumActiveDays: 3,
    },
  );
  const [timezone, setTimezone] = useState(initial.policy?.timezone ?? 'Asia/Tokyo');
  const [enabled, setEnabled] = useState(initial.policy?.status === 'ACTIVE');
  const url = `/api/services/${encodeURIComponent(serviceSlug)}/referral-management`;
  async function more() {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(
        `${url}?after=${encodeURIComponent(value.referrals.at(-1)!.referralId)}`,
        { cache: 'no-store' },
      );
      if (!response.ok) throw new Error('次の紹介を確認できませんでした。');
      const next = (await response.json()) as { data: ReferralManagementOverview };
      setValue({ ...next.data, referrals: [...value.referrals, ...next.data.referrals] });
    } catch {
      setMessage('次の紹介を確認できませんでした。再読み込みしてください。');
    } finally {
      setBusy(false);
    }
  }
  async function send(payload: object) {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok)
        throw new Error(
          response.status === 429
            ? '少し時間をおいてから、再読み込みしてお試しください。'
            : response.status === 409
              ? '条件未達・証拠不足・他の操作との競合があります。再読み込みして確認してください。'
              : '保存できませんでした。権限・入力を確認してから再読み込みしてください。',
        );
      const fresh = await fetch(url, { cache: 'no-store' });
      if (!fresh.ok) throw new Error('保存後の状態を確認できません。再読み込みしてください。');
      const data = (await fresh.json()) as { data: ReferralManagementOverview };
      setValue(data.data);
      setReason('');
      setMessage('保存しました。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存できませんでした。');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="referral-management">
      {value.progress && (
        <section className="settings-card">
          <h2>紹介実績</h2>
          <dl>
            <div>
              <dt>紹介リンクのクリック</dt>
              <dd>{value.progress.clicks}回</dd>
            </div>
            <div>
              <dt>紹介経由の登録</dt>
              <dd>{value.progress.registrations}人</dd>
            </div>
            <div>
              <dt>無料鑑定を閲覧</dt>
              <dd>{value.progress.freeReadingMembers}人</dd>
            </div>
            <div>
              <dt>有料鑑定を購入（返金済みを除く）</dt>
              <dd>{value.progress.paidMembers}人</dd>
            </div>
            <div>
              <dt>紹介特典の累計付与</dt>
              <dd>{value.progress.grantedCredits}</dd>
            </div>
            <div>
              <dt>サービス内の累計クレジット消費</dt>
              <dd>{value.progress.consumedCredits}</dd>
            </div>
          </dl>
          <a href={`/s/${serviceSlug}/manage/fortune/revenue`}>占いの原価を見る</a>
        </section>
      )}
      <section className="settings-card">
        <h2>有効紹介の条件</h2>
        <p>本部の承認があるサービスだけで確定できます。OEMは本部の条件を緩和できません。</p>
        <p>
          {fortune
            ? '初回の会員登録を確認したうえで、無料鑑定の閲覧と決済確定から判定します。'
            : '条件を保存すると、既存の画像特典も今後の付与には審査・確定が必要になります。停止中は新しい付与を行いません。'}
        </p>
        <p>
          現在：
          {value.policy
            ? `第${value.policy.version}版・${value.policy.status === 'ACTIVE' ? '有効' : '停止'}`
            : '未設定（確定・新制度の付与は準備中）'}
        </p>
        {initial.canSetHeadquartersPolicy && (
          <label>
            設定範囲
            <select
              aria-label="設定範囲"
              disabled={busy}
              value={authority}
              onChange={(e) => setAuthority(e.target.value as typeof authority)}
            >
              <option value="HEADQUARTERS">本部の承認条件</option>
              <option value="SERVICE">サービス独自条件</option>
            </select>
          </label>
        )}
        <fieldset disabled={busy || (!value.headquartersPolicy && !value.canSetHeadquartersPolicy)}>
          <legend>達成条件</legend>
          {fortune ? (
            <>
              <label>
                <input
                  type="checkbox"
                  checked={fortuneConditions.requireFirstFreeReading}
                  onChange={(e) =>
                    setFortuneConditions({
                      ...fortuneConditions,
                      requireFirstFreeReading: e.target.checked,
                    })
                  }
                />
                初回の無料鑑定を読む
              </label>
              <label>
                無料鑑定を読んだ日数
                <input
                  type="number"
                  min={0}
                  max={3660}
                  value={fortuneConditions.minimumActiveDays}
                  onChange={(e) =>
                    setFortuneConditions({
                      ...fortuneConditions,
                      minimumActiveDays: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label>
                決済済みの有料鑑定の購入回数（0は条件なし）
                <input
                  type="number"
                  min={0}
                  max={1000}
                  value={fortuneConditions.minimumPaidPurchases}
                  onChange={(e) =>
                    setFortuneConditions({
                      ...fortuneConditions,
                      minimumPaidPurchases: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label>
                紹介登録の対象開始日（日本時間）
                <input
                  type="date"
                  value={startsOn}
                  onChange={(e) =>
                    setFortuneConditions({ ...fortuneConditions, startsOn: e.target.value })
                  }
                />
              </label>
              <label>
                紹介登録の対象終了日（この日を含めない・日本時間）
                <input
                  type="date"
                  value={endsBefore}
                  onChange={(e) =>
                    setFortuneConditions({ ...fortuneConditions, endsBefore: e.target.value })
                  }
                />
              </label>
            </>
          ) : (
            <>
              {(
                [
                  ['requireNewRegistration', '新規登録'],
                  ['requireOnboarding', '初期設定完了'],
                  ['requireFirstUserGeneration', '本人による初回投稿案作成'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} style={{ display: 'block', padding: 8 }}>
                  <input
                    type="checkbox"
                    checked={conditions[key]}
                    onChange={(e) => setConditions({ ...conditions, [key]: e.target.checked })}
                  />
                  {label}
                </label>
              ))}
              <label>
                必要な活動日数
                <input
                  aria-label="必要な活動日数"
                  type="number"
                  min={0}
                  max={3660}
                  value={conditions.minimumActiveDays}
                  onChange={(e) =>
                    setConditions({ ...conditions, minimumActiveDays: Number(e.target.value) })
                  }
                />
              </label>
            </>
          )}
          <label>
            日付のタイムゾーン
            <input
              aria-label="日付のタイムゾーン"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              maxLength={64}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            新しい確定と特典付与を有効にする
          </label>
        </fieldset>
      </section>
      <section className="settings-card">
        <label>
          操作の理由（必須）
          <textarea
            aria-label="操作の理由"
            value={reason}
            maxLength={1000}
            disabled={busy}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={
            busy || !reason.trim() || (!value.canSetHeadquartersPolicy && !value.headquartersPolicy)
          }
          onClick={() =>
            void send({
              kind: 'POLICY',
              authority,
              expectedPolicyVersionId: value.policy?.id ?? null,
              status: enabled ? 'ACTIVE' : 'SUSPENDED',
              timezone,
              conditions: fortune ? savedFortuneConditions : conditions,
              reason,
            })
          }
        >
          条件を新しい版で保存
        </button>
        <p role="status" aria-live="polite">
          {message}
        </p>
      </section>
      <section className="settings-card">
        <h2>紹介の確認</h2>
        <p>
          「問題なし」の審査後、保存済みの利用履歴で条件を満たした紹介だけを確定します。
          {fortune
            ? '取消時は、対象の紹介で付与された未使用分を取り消します。'
            : '確定の取消では付与済みクレジットを回収しません。'}
        </p>
        <p>取消済みの紹介は再確定できません。</p>
        {!value.referrals.length && <p>紹介記録はありません。</p>}
        {value.referrals.map((row) => (
          <article
            key={row.referralId}
            style={{ padding: '16px 0', borderBottom: '1px solid #ddd', overflowWrap: 'anywhere' }}
          >
            <p>紹介ID：{row.referralId}</p>
            <p>
              <a
                href={`/s/${serviceSlug}/manage/members?member=${encodeURIComponent(row.referredMembershipId)}`}
              >
                被紹介会員を管理画面で確認
              </a>
            </p>
            <p>
              <a
                href={`/s/${serviceSlug}/manage/members?member=${encodeURIComponent(row.referrerMembershipId)}`}
              >
                紹介元会員を管理画面で確認
              </a>
            </p>
            <p>
              {row.state === 'CONFIRMED'
                ? '確定済み'
                : row.state === 'REVOKED'
                  ? '取消済み'
                  : '未確定'}{' '}
              ／
              {row.review === 'CLEAR'
                ? '審査：問題なし'
                : row.review === 'REQUIRED'
                  ? '要確認'
                  : '未審査'}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {row.state === 'UNASSESSED' && (
                <>
                  {(['REQUIRED', 'CLEAR'] as const).map((review) => (
                    <button
                      key={review}
                      type="button"
                      disabled={busy || !reason.trim()}
                      onClick={() =>
                        void send({
                          kind: 'REVIEW',
                          review,
                          commandId: crypto.randomUUID(),
                          referralId: row.referralId,
                          expectedRevision: row.revision,
                          reason,
                        })
                      }
                    >
                      {review === 'CLEAR' ? '審査：問題なし' : '要確認にする'}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={
                      busy ||
                      !reason.trim() ||
                      row.review !== 'CLEAR' ||
                      value.policy?.status !== 'ACTIVE' ||
                      value.headquartersPolicy?.status !== 'ACTIVE'
                    }
                    onClick={() =>
                      void send({
                        kind: 'CONFIRM',
                        commandId: crypto.randomUUID(),
                        referralId: row.referralId,
                        expectedRevision: row.revision,
                        expectedPolicyVersionId: value.policy?.id,
                        reason,
                      })
                    }
                  >
                    条件を検証して確定
                  </button>
                </>
              )}
              {row.state === 'CONFIRMED' && (
                <button
                  type="button"
                  disabled={busy || !reason.trim()}
                  onClick={() =>
                    void send({
                      kind: 'REVOKE',
                      commandId: crypto.randomUUID(),
                      referralId: row.referralId,
                      expectedRevision: row.revision,
                      reason,
                    })
                  }
                >
                  有効紹介の確定を取り消す
                </button>
              )}
            </div>
          </article>
        ))}
        {value.hasMore && (
          <button type="button" disabled={busy} onClick={() => void more()}>
            次の100件を表示
          </button>
        )}
        <a href={`/s/${serviceSlug}/manage/referral-rewards`}>画像クレジット特典の設定</a>
      </section>
    </div>
  );
}
