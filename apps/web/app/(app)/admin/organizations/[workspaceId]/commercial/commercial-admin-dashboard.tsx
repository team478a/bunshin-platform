import Link from 'next/link';
import type { CommercialAdminDashboardProps } from './commercial-admin-types';
import { CommercialContractSection } from './commercial-contract-section';
import { CommercialInvoiceSections } from './commercial-invoice-sections';
import { OemBillingPreparationSection } from './oem-billing-preparation-section';

function yen(value: number | null): string {
  return value === null ? '個別見積' : `${value.toLocaleString('ja-JP')}円`;
}

const REVIEW_REASON_LABELS = {
  BILLING_POLICY_NOT_READY: '課金ポリシーの準備または適用状態を確認してください。',
  BILLING_HISTORY_INCOMPLETE: '契約・提供区分・正式登録の履歴が不足しています。',
  OFFERING_TIMELINE_GAP: '正式登録期間を覆う提供区分の履歴に空白があります。',
  USAGE_OFFERING_HISTORY_MISSING: '無料実利用時点の提供区分履歴が不足しています。',
  FORMAL_REGISTRATION_EVIDENCE_MISSING: '有効な参加者に正式登録の根拠がありません。',
  UNKNOWN: '要確認の理由を特定できません。履歴を推測せず運営担当者が確認してください。',
} as const;

function count(value: number | null): string {
  return value === null ? '—' : `${value.toLocaleString('ja-JP')}人`;
}

export function CommercialAdminDashboard(props: CommercialAdminDashboardProps) {
  const { dashboard, billing, query, reminderFailures, actions } = props;
  const { current } = dashboard;
  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">OEM商用管理</p>
        <h1>{dashboard.workspace.name}の利用量・料金</h1>
        <p>
          実利用人数（MAU）と、正式登録・無料実利用から算出した課金対象人数を月ごとに確認します。
        </p>
        <Link href="/admin/organizations">← 運営団体一覧へ戻る</Link>
      </header>

      {!dashboard.workspace.oemEnabled ? (
        <p className="notice notice--danger">
          OEM利用が許可されていません。「契約・利用上限」でOEMを有効にすると請求対象として運用できます。
        </p>
      ) : null}
      {query.finalized === '1' ? (
        <p className="notice notice--success">前月の利用人数と料金を確定しました。</p>
      ) : null}
      {query.contractSaved === '1' ? (
        <p className="notice notice--success">契約・請求先を保存しました。</p>
      ) : null}
      {query.prepared === '1' ? (
        <p className="notice notice--success">確定済みの利用から請求記録を作成しました。</p>
      ) : null}
      {query.invoiceUpdated === '1' ? (
        <p className="notice notice--success">請求状態を更新しました。</p>
      ) : null}
      {query.customQuoteSaved === '1' ? (
        <p className="notice notice--success">個別見積の金額で請求記録を作成しました。</p>
      ) : null}
      {query.setupFeeSaved === '1' ? (
        <p className="notice notice--success">初期費用の請求下書きを作成しました。</p>
      ) : null}
      {query.reminderSent === '1' ? (
        <p className="notice notice--success">請求先へメールを送信し、履歴を保存しました。</p>
      ) : null}
      {query.recipientTestSent === '1' ? (
        <p className="notice notice--success">
          保存済みの請求先へテストメールを送信し、履歴を保存しました。
        </p>
      ) : null}
      {query.error ? (
        <p className="notice notice--danger">
          {query.error === 'recipient-test-target'
            ? '先に契約・請求先を保存してからテストしてください。'
            : query.error === 'recipient-test-email'
              ? '送信できる管理者メール設定がありません。管理者メールの接続確認と利用開始を確認してください。'
              : query.error === 'recipient-test-send'
                ? '請求先へのテストメールを送信できませんでした。請求先と管理者メール設定を確認してください。'
                : query.error === 'reminder-email'
                  ? '送信できる管理者メール設定がありません。管理者メールの接続確認と利用開始を確認してください。'
                  : query.error === 'reminder-target'
                    ? 'この請求は案内メールを送れる状態ではありません。請求状態と支払期限を確認してください。'
                    : query.error === 'reminder-send'
                      ? '請求案内メールを送信できませんでした。メール設定と送信サービスの状態を確認してください。'
                      : query.error === 'setupFee'
                        ? '初期費用の請求下書きを作成できませんでした。契約、対象商品のOffering期間、請求キー、合意日を確認してください。'
                        : query.error === 'oemPreparation'
                          ? '正式登録課金の準備を更新できませんでした。証跡、現在の履歴、商品ポリシー、対象月を確認してください。'
                          : '保存または更新できませんでした。入力内容と現在の状態を確認してください。'}
        </p>
      ) : null}

      {current.billingState === 'REVIEW_REQUIRED' ? (
        <p className="notice notice--danger">
          課金対象人数は未確定です。
          {REVIEW_REASON_LABELS[current.billingReviewReason ?? 'UNKNOWN']}
          不足履歴を確認するまで、0人やMAUで代用して請求を確定しないでください。
        </p>
      ) : null}

      <section className="operations-overview" aria-label="今月の商用利用状況">
        <div>
          <span>対象月</span>
          <strong>{current.month}</strong>
        </div>
        <div>
          <span>課金方式</span>
          <strong>
            {current.billingState === 'REGISTRATION_V2'
              ? '正式登録課金 V2'
              : current.billingState === 'LEGACY_MAU'
                ? '旧MAU方式'
                : '要確認'}
          </strong>
        </div>
        <div>
          <span>有料の正式登録 R</span>
          <strong>{count(current.registeredUserCount)}</strong>
        </div>
        <div>
          <span>無料の実利用 A</span>
          <strong>{count(current.freeActiveUserCount)}</strong>
        </div>
        <div>
          <span>R・Aの重複</span>
          <strong>{count(current.overlapUserCount)}</strong>
        </div>
        <div>
          <span>最終課金人数 R∪A</span>
          <strong>{count(current.billableUserCount)}</strong>
        </div>
        <div>
          <span>今月のMAU</span>
          <strong>{current.mau.toLocaleString('ja-JP')}人</strong>
        </div>
        <div>
          <span>現在の月額</span>
          <strong>
            {current.billingState === 'REVIEW_REQUIRED'
              ? '確認待ち（請求未確定）'
              : yen(current.pricing.priceYen)}
          </strong>
        </div>
        <div>
          <span>次の料金帯まで</span>
          <strong>
            {current.billingState === 'REVIEW_REQUIRED'
              ? '—'
              : current.pricing.remainingToNextTier === null
                ? '個別見積'
                : `あと${current.pricing.remainingToNextTier}人`}
          </strong>
        </div>
      </section>

      <section className="settings-card">
        <h2>月ごとの課金人数根拠</h2>
        <p>
          確定時に保存した人数スナップショットです。旧MAU方式の月にはR・A・重複の内訳がないため、推測して補完しません。
        </p>
        {dashboard.history.length === 0 ? (
          <p>確定済みの月はまだありません。</p>
        ) : (
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>対象月</th>
                  <th>方式</th>
                  <th>有料登録 R</th>
                  <th>無料実利用 A</th>
                  <th>重複</th>
                  <th>最終課金人数</th>
                  <th>MAU</th>
                  <th>確定料金</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.history.map((row) => (
                  <tr key={row.month}>
                    <td>{row.month}</td>
                    <td>{row.billingRuleVersion ? '正式登録課金 V2' : '旧MAU方式'}</td>
                    <td>{count(row.registeredUserCount)}</td>
                    <td>{count(row.freeActiveUserCount)}</td>
                    <td>{count(row.overlapUserCount)}</td>
                    <td>{count(row.billableUserCount)}</td>
                    <td>{count(row.mau)}</td>
                    <td>{yen(row.priceYen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <OemBillingPreparationSection
        dashboard={dashboard}
        query={query}
        oemPreparation={props.oemPreparation}
        oemShadow={props.oemShadow}
        oemShadowReviewRequired={props.oemShadowReviewRequired}
        actions={actions}
      />

      <CommercialContractSection dashboard={dashboard} billing={billing} actions={actions} />
      <CommercialInvoiceSections
        dashboard={dashboard}
        billing={billing}
        reminderFailures={reminderFailures}
        actions={actions}
      />
    </main>
  );
}
