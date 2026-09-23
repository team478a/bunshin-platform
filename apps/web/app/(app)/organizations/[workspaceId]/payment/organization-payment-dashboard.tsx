import Link from 'next/link';
import type { PaymentConfigurationView } from './organization-payment-types';

const results: Record<string, string> = {
  saved: '設定を下書き保存しました。次に接続確認をしてください。',
  verified: 'Stripeとの接続を確認しました。「決済接続を有効にする」を押すと使用できます。',
  'verification-failed': 'Stripeへ接続できませんでした。秘密鍵を確認して保存し直してください。',
  activated: 'この運営団体の決済設定を有効にしました。',
  disabled: 'この運営団体の決済設定を停止しました。',
  'credentials-required': '最初の登録ではStripeの秘密鍵が必要です。',
  'invalid-secret-key': 'Stripeの秘密鍵（sk_test_ または sk_live_ で始まる値）を入力してください。',
  'invalid-webhook-secret': 'Webhook署名シークレット（whsec_ で始まる値）を入力してください。',
  'verification-required': '接続確認が完了した設定だけ有効にできます。',
  'webhook-required': '決済を有効にする前にWebhook署名シークレットを登録してください。',
  'webhook-recovered': 'Stripeから決済通知を再取得し、処理を完了しました。',
  'webhook-recovery-failed':
    '再処理できませんでした。Stripeの取引状態と接続設定を確認してください。',
  'payment-reconciled-paid': 'Stripeで入金を確認し、購入者の利用を開始しました。',
  'payment-reconciled-expired': 'Stripeで期限切れを確認し、支払い待ちを終了しました。',
  'payment-reconciled-unchanged': 'Stripeではまだ支払い待ちです。時間を置いて確認してください。',
  'payment-reconciliation-failed':
    'Stripeと照合できませんでした。決済接続とCheckoutの状態を確認してください。',
};

const statusLabel = {
  DRAFT: '下書き',
  VERIFIED: '接続確認済み',
  ACTIVE: '使用中',
  DISABLED: '停止中',
  ERROR: '接続エラー',
} as const;

export function OrganizationPaymentDashboard({
  workspace,
  configuration,
  result,
}: {
  workspace: { id: string; name: string };
  configuration: PaymentConfigurationView | null;
  result?: string | undefined;
}) {
  return (
    <>
      <header className="app-page__heading">
        <p className="eyebrow">OEM決済設定</p>
        <h1>{workspace.name}の決済先</h1>
        <p>この団体が販売する有料サービスの売上を受け取るStripeを設定します。</p>
        <Link href={`/organizations/${workspace.id}/manage`}>← 団体管理へ戻る</Link>
      </header>

      {result && results[result] ? (
        <section className="settings-card" role="status">
          <strong>{results[result]}</strong>
        </section>
      ) : null}

      <section className="operations-overview" aria-label="決済設定の状態">
        <div>
          <span>決済サービス</span>
          <strong>Stripe</strong>
        </div>
        <div>
          <span>状態</span>
          <strong>{configuration ? statusLabel[configuration.status] : '未設定'}</strong>
        </div>
        <div>
          <span>Stripeアカウント</span>
          <strong>{configuration?.accountReference ?? '未確認'}</strong>
        </div>
        <div>
          <span>最終接続確認</span>
          <strong>
            {configuration?.lastVerifiedAt?.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) ??
              '未確認'}
          </strong>
        </div>
      </section>
    </>
  );
}
