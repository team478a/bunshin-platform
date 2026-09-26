import type { CommercialAdminDashboardProps } from './commercial-admin-types';

const EVENT_LABELS: Record<string, string> = {
  POST_VIEW: '投稿案を表示',
  POST_GENERATE: '投稿案を生成',
  POST_REGENERATE: '投稿案を再生成',
  DAILY_MISSION_VIEW: '今日やることを確認',
  WEEKLY_PLAN_VIEW: '週間計画を確認',
  CONTENT_APPROVE: '投稿内容を採用',
};

function dateTimeInput(value: Date | null | undefined): string {
  if (!value) return '';
  const local = new Date(value.getTime() + 9 * 60 * 60 * 1_000);
  return local.toISOString().slice(0, 16);
}

export function CommercialContractSection({
  dashboard,
  billing,
  actions,
}: Pick<CommercialAdminDashboardProps, 'dashboard' | 'billing' | 'actions'>) {
  const { saveContract, sendBillingRecipientTest } = actions;
  const { current } = dashboard;
  return (
    <>
      <section className="settings-card">
        <h2>OEM契約と請求先</h2>
        <p>
          MAU課金を請求へつなぐための契約情報です。税務上の請求書や決済は外部サービスで発行し、その番号と入金状態を下の請求台帳で管理します。
        </p>
        <form className="form-stack" action={saveContract}>
          <input type="hidden" name="workspaceId" value={dashboard.workspace.id} />
          <label className="field">
            <span className="field__label">契約状態</span>
            <select
              className="field__control"
              name="status"
              defaultValue={billing.organizationCommercialContract?.status ?? 'DRAFT'}
            >
              <option value="DRAFT">準備中</option>
              <option value="ACTIVE">契約中</option>
              <option value="SUSPENDED">一時停止</option>
              <option value="ENDED">終了</option>
            </select>
          </label>
          <label className="field">
            <span className="field__label">請求方法</span>
            <select
              className="field__control"
              name="billingMode"
              defaultValue={billing.organizationCommercialContract?.billingMode ?? 'MANUAL_INVOICE'}
            >
              <option value="MANUAL_INVOICE">請求書・手作業</option>
              <option value="EXTERNAL_BILLING">外部決済サービス</option>
            </select>
          </label>
          <label className="field">
            <span className="field__label">請求先名</span>
            <input
              className="field__control"
              name="billingName"
              required
              maxLength={200}
              defaultValue={
                billing.organizationCommercialContract?.billingName ??
                billing.legalName ??
                billing.name
              }
            />
          </label>
          <label className="field">
            <span className="field__label">請求先メール</span>
            <input
              className="field__control"
              name="billingEmail"
              type="email"
              required
              maxLength={320}
              defaultValue={
                billing.organizationCommercialContract?.billingEmail ?? billing.contactEmail ?? ''
              }
            />
          </label>
          <label className="field">
            <span className="field__label">支払期限（日数）</span>
            <input
              className="field__control"
              name="paymentTermsDays"
              type="number"
              min={0}
              max={365}
              required
              defaultValue={billing.organizationCommercialContract?.paymentTermsDays ?? 30}
            />
          </label>
          <label className="field field--checkbox">
            <input
              name="automaticRemindersEnabled"
              type="checkbox"
              defaultChecked={
                billing.organizationCommercialContract?.automaticRemindersEnabled ?? false
              }
            />
            <span>支払期限の3日前と期限超過後に、請求先へ案内メールを自動送信する</span>
          </label>
          <div className="form-grid form-grid--two">
            <label className="field">
              <span className="field__label">期限前の案内（日数）</span>
              <input
                className="field__control"
                name="reminderLeadDays"
                type="number"
                min={0}
                max={30}
                required
                defaultValue={billing.organizationCommercialContract?.reminderLeadDays ?? 3}
              />
            </label>
            <label className="field">
              <span className="field__label">期限超過後の再案内間隔（日数）</span>
              <input
                className="field__control"
                name="overdueReminderIntervalDays"
                type="number"
                min={1}
                max={30}
                required
                defaultValue={
                  billing.organizationCommercialContract?.overdueReminderIntervalDays ?? 7
                }
              />
            </label>
          </div>
          <p className="field__hint">
            初期状態は停止です。管理者メールの接続確認が完了している場合だけ送信します。期限前案内は1回、期限超過後は設定した間隔で再案内します。
          </p>
          <label className="field field--checkbox">
            <input
              name="automaticCollectionEnabled"
              type="checkbox"
              defaultChecked={
                billing.organizationCommercialContract?.automaticCollectionEnabled ?? false
              }
            />
            <span>契約上の同意を確認し、次回以降の月額料金を保存カードから回収する</span>
          </label>
          <p className="field__hint">
            初期状態は停止です。有効化後、団体管理者が最初のStripe支払いを完了すると支払方法が保存されます。カード番号はワタシワークスへ保存しません。
          </p>
          <label className="field">
            <span className="field__label">外部顧客番号（任意）</span>
            <input
              className="field__control"
              name="externalCustomerReference"
              maxLength={200}
              defaultValue={billing.organizationCommercialContract?.externalCustomerReference ?? ''}
            />
          </label>
          <div className="form-grid form-grid--two">
            <label className="field">
              <span className="field__label">契約開始（任意）</span>
              <input
                className="field__control"
                name="startsAt"
                type="datetime-local"
                defaultValue={dateTimeInput(billing.organizationCommercialContract?.startsAt)}
              />
            </label>
            <label className="field">
              <span className="field__label">契約終了（任意）</span>
              <input
                className="field__control"
                name="endsAt"
                type="datetime-local"
                defaultValue={dateTimeInput(billing.organizationCommercialContract?.endsAt)}
              />
            </label>
          </div>
          <button className="button" type="submit">
            契約・請求先を保存
          </button>
        </form>
        {billing.organizationCommercialContract ? (
          <div className="settings-stack service-template-preview">
            <h3>請求先メールをテスト</h3>
            <p>実際の請求を始める前に、保存済みの請求先へ支払い不要の接続確認メールを送ります。</p>
            <p>
              送信先：<strong>{billing.organizationCommercialContract.billingEmail}</strong>
            </p>
            <form action={sendBillingRecipientTest}>
              <input type="hidden" name="workspaceId" value={dashboard.workspace.id} />
              <button className="button button--secondary" type="submit">
                請求先へテストメールを送る
              </button>
            </form>
          </div>
        ) : (
          <p className="field__hint">契約・請求先を保存してからテストしてください。</p>
        )}
      </section>

      <section className="settings-card">
        <h2>MAUに含める利用</h2>
        <p>
          単なる登録やログインは含めません。参加者が次の機能を利用した月だけ、1人として数えます。同じ人が何度使っても月内は1人です。
        </p>
        {current.eventCounts.length === 0 ? (
          <p>今月は対象となる利用がまだありません。</p>
        ) : (
          <ul className="summary-list">
            {current.eventCounts.map((event) => (
              <li key={event.eventType}>
                <span>{EVENT_LABELS[event.eventType] ?? event.eventType}</span>
                <strong>{event.count.toLocaleString('ja-JP')}回</strong>
              </li>
            ))}
          </ul>
        )}
        <p className="field__hint">運営者、スタッフ、システム管理者の操作は除外されます。</p>
      </section>
    </>
  );
}
