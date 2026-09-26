import Link from 'next/link';
import type { CommercialAdminDashboardProps } from './commercial-admin-types';
import { CommercialContractSection } from './commercial-contract-section';
import { CommercialInvoiceSections } from './commercial-invoice-sections';

function yen(value: number | null): string {
  return value === null ? '個別見積' : `${value.toLocaleString('ja-JP')}円`;
}

export function CommercialAdminDashboard(props: CommercialAdminDashboardProps) {
  const { dashboard, billing, query, reminderFailures, actions } = props;
  const { current } = dashboard;
  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">OEM商用管理</p>
        <h1>{dashboard.workspace.name}の利用量・料金</h1>
        <p>参加者が実際にサービスを使った人数を、運営団体単位で月ごとに集計します。</p>
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
                      : '保存または更新できませんでした。入力内容と現在の状態を確認してください。'}
        </p>
      ) : null}

      <section className="operations-overview" aria-label="今月の商用利用状況">
        <div>
          <span>対象月</span>
          <strong>{current.month}</strong>
        </div>
        <div>
          <span>今月のMAU</span>
          <strong>
            {current.mau} / {current.pricing.upperLimit ?? '見積'}人
          </strong>
        </div>
        <div>
          <span>現在の月額</span>
          <strong>{yen(current.pricing.priceYen)}</strong>
        </div>
        <div>
          <span>次の料金帯まで</span>
          <strong>
            {current.pricing.remainingToNextTier === null
              ? '個別見積'
              : `あと${current.pricing.remainingToNextTier}人`}
          </strong>
        </div>
      </section>

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
