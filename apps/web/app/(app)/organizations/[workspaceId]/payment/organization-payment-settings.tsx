import type { PaymentAction, PaymentConfigurationView } from './organization-payment-types';

export function OrganizationPaymentSettings({
  workspaceId,
  configuration,
  webhookUrl,
  saveConfiguration,
  testConnection,
  setActive,
  pauseConfiguration,
}: {
  workspaceId: string;
  configuration: PaymentConfigurationView | null;
  webhookUrl: string | null;
  saveConfiguration: PaymentAction;
  testConnection: PaymentAction;
  setActive: PaymentAction;
  pauseConfiguration: PaymentAction;
}) {
  return (
    <>
      <section className="settings-card">
        <h2>設定手順</h2>
        <ol>
          <li>Stripe管理画面でAPIの秘密鍵を確認します。</li>
          <li>下のフォームで保存し、「Stripeとの接続を確認する」を押します。</li>
          <li>接続確認後に「決済接続を有効にする」を押します。</li>
          <li>購入受付を始める前に、次の設定でWebhookを登録します。</li>
        </ol>
        {webhookUrl ? (
          <div className="settings-card__notice">
            <strong>Stripeに登録するWebhook URL</strong>
            <p className="break-all">{webhookUrl}</p>
            <p>
              送信イベントは checkout.session.completed、checkout.session.expired、
              charge.refunded、charge.dispute.created、charge.dispute.updated、
              charge.dispute.closed を選んでください。
            </p>
          </div>
        ) : null}
        <p>カード番号など購入者の決済情報は、この画面には入力しません。</p>
      </section>

      <section className="settings-card">
        <h2>{configuration ? '接続情報を変更する' : '接続情報を登録する'}</h2>
        {configuration ? (
          <p>
            登録済み：秘密鍵 {configuration.secretKeyMask}／Webhook署名{' '}
            {configuration.webhookSecretMask ?? '未登録'}。変更しない欄は空欄のままで構いません。
          </p>
        ) : null}
        <form action={saveConfiguration}>
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <label>
            Stripe秘密鍵
            <input
              name="secretKey"
              type="password"
              autoComplete="new-password"
              required={!configuration}
              placeholder="sk_live_... または sk_test_..."
            />
          </label>
          <label>
            Webhook署名シークレット
            <input
              name="webhookSecret"
              type="password"
              autoComplete="new-password"
              placeholder="whsec_..."
            />
            <small>StripeでWebhook URLを登録した後に表示される whsec_ から始まる値です。</small>
          </label>
          <label>
            変更理由
            <input
              name="reason"
              required
              minLength={3}
              maxLength={500}
              placeholder="例：初回設定"
            />
          </label>
          <button className="button button--primary button--full" type="submit">
            接続情報を保存する
          </button>
        </form>
      </section>

      {configuration ? (
        <section className="settings-card">
          <h2>接続確認と使用状態</h2>
          {configuration.lastErrorCategory ? (
            <p>前回のエラー：{configuration.lastErrorCategory}</p>
          ) : null}
          <form action={testConnection}>
            <input type="hidden" name="workspaceId" value={workspaceId} />
            <input type="hidden" name="reason" value="運営団体管理画面から接続確認" />
            <button className="button button--secondary button--full" type="submit">
              Stripeとの接続を確認する
            </button>
          </form>
          {configuration.status === 'VERIFIED' ? (
            <form action={setActive}>
              <input type="hidden" name="workspaceId" value={workspaceId} />
              <input type="hidden" name="reason" value="接続確認後に決済を有効化" />
              <button className="button button--primary button--full" type="submit">
                決済接続を有効にする
              </button>
            </form>
          ) : null}
          {configuration.status === 'ACTIVE' ? (
            <form action={pauseConfiguration}>
              <input type="hidden" name="workspaceId" value={workspaceId} />
              <input type="hidden" name="reason" value="運営団体管理画面から決済を停止" />
              <button className="button button--danger button--full" type="submit">
                決済を停止する
              </button>
            </form>
          ) : null}
        </section>
      ) : null}

      <section className="settings-card">
        <h2>安全な管理</h2>
        <ul>
          <li>秘密鍵とWebhook署名シークレットは暗号化して保存します。</li>
          <li>保存後は値全体を画面へ再表示しません。</li>
          <li>保存・接続確認・有効化・停止は変更者と理由を記録します。</li>
          <li>この団体の所有者・管理者だけが設定できます。</li>
        </ul>
        <p>
          有効化後の購入はStripeの画面で行われ、署名を確認できた入金だけが利用開始に反映されます。全額返金、Checkout期限切れ、カード会社への異議申立てと解決結果も自動で台帳と利用状態へ反映します。
        </p>
      </section>
    </>
  );
}
