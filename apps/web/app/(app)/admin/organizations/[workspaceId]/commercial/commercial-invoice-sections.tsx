import type { CommercialAdminDashboardProps } from './commercial-admin-types';

function yen(value: number | null): string {
  return value === null ? '個別見積' : `${value.toLocaleString('ja-JP')}円`;
}

function invoiceStatusLabel(status: 'DRAFT' | 'ISSUED' | 'PAID' | 'VOID', dueAt: Date | null) {
  if (status === 'ISSUED' && dueAt && dueAt < new Date()) return '支払期限超過';
  return { DRAFT: '下書き', ISSUED: '請求済み', PAID: '入金済み', VOID: '取消' }[status];
}

export function CommercialInvoiceSections({
  dashboard,
  billing,
  reminderFailures,
  actions,
}: Pick<CommercialAdminDashboardProps, 'dashboard' | 'billing' | 'reminderFailures' | 'actions'>) {
  const {
    prepareInvoices,
    transitionInvoice,
    prepareCustomQuoteInvoice,
    prepareSetupFeeInvoice,
    sendInvoiceReminder,
    finalizePreviousMonth,
  } = actions;
  return (
    <>
      <section className="settings-card">
        <h2>請求・入金管理</h2>
        <p>確定MAUから重複しない請求記録を作成し、外部請求書の発行と入金を追跡します。</p>
        <form action={prepareInvoices}>
          <input type="hidden" name="workspaceId" value={dashboard.workspace.id} />
          <button
            className="button"
            type="submit"
            disabled={billing.organizationCommercialContract?.status !== 'ACTIVE'}
          >
            確定済みの月から請求記録を作る
          </button>
        </form>
        <div className="settings-stack">
          <h3>OEM初期費用の請求下書き</h3>
          <p>
            締結済み契約の金額と対象商品を確認して、月額とは別の請求記録を作ります。金額は商品名や先行社数から自動計算しません。
          </p>
          {billing.setupFeeProducts.length === 0 ? (
            <p>現在提供中の商品がないため、初期費用は登録できません。</p>
          ) : (
            <form className="form-stack service-template-preview" action={prepareSetupFeeInvoice}>
              <input type="hidden" name="workspaceId" value={billing.id} />
              <label className="field">
                <span className="field__label">対象商品</span>
                <select className="field__control" name="productId" required>
                  {billing.setupFeeProducts.map((product) => (
                    <option value={product.id} key={product.id}>
                      {product.displayName}（{product.key}）
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field__label">一意の請求キー</span>
                <input
                  className="field__control"
                  name="chargeKey"
                  pattern="[A-Z0-9][A-Z0-9_-]{2,79}"
                  placeholder="SIGNED_AGREEMENT_2026_A"
                  required
                />
              </label>
              <label className="field">
                <span className="field__label">合意済み初期費用（税込・円）</span>
                <input
                  className="field__control"
                  name="amountYen"
                  type="number"
                  min="1"
                  max="1000000000"
                  required
                />
              </label>
              <label className="field">
                <span className="field__label">請求内容</span>
                <input className="field__control" name="description" maxLength={200} required />
              </label>
              <label className="field">
                <span className="field__label">契約書・申込書の参照番号</span>
                <input
                  className="field__control"
                  name="agreementReference"
                  maxLength={200}
                  required
                />
              </label>
              <label className="field">
                <span className="field__label">合意日</span>
                <input className="field__control" name="agreedAt" type="date" required />
              </label>
              <label className="field">
                <span className="field__label">登録理由</span>
                <textarea
                  className="field__control"
                  name="reason"
                  minLength={10}
                  maxLength={1000}
                  required
                />
              </label>
              <label>
                <input type="checkbox" name="confirmed" required />
                契約証跡、対象商品、税込金額を確認し、月額とは別請求であることを確認しました
              </label>
              <button
                className="button"
                type="submit"
                disabled={billing.organizationCommercialContract?.status !== 'ACTIVE'}
              >
                初期費用の請求下書きを作る
              </button>
            </form>
          )}
        </div>
        {billing.tenantMonthlyUsage.length > 0 ? (
          <div className="settings-stack">
            <h3>個別見積の金額を確定</h3>
            <p>3,001 MAU以上の月は、合意した税抜・税込条件に沿った請求総額を入力します。</p>
            {billing.tenantMonthlyUsage.map((usage) => (
              <form
                className="form-stack service-template-preview"
                action={prepareCustomQuoteInvoice}
                key={usage.id}
              >
                <input type="hidden" name="workspaceId" value={billing.id} />
                <input type="hidden" name="monthlyUsageId" value={usage.id} />
                <strong>
                  {usage.periodStart.toISOString().slice(0, 7)}／{usage.mau.toLocaleString('ja-JP')}{' '}
                  MAU
                </strong>
                <label className="field">
                  <span className="field__label">合意した請求総額（円）</span>
                  <input
                    className="field__control"
                    name="amountYen"
                    type="number"
                    min="1"
                    max="1000000000"
                    required
                  />
                </label>
                <label className="field">
                  <span className="field__label">見積条件・メモ（任意）</span>
                  <input className="field__control" name="notes" maxLength={1000} />
                </label>
                <button className="button" type="submit">
                  この金額で請求記録を作る
                </button>
              </form>
            ))}
          </div>
        ) : null}
        {billing.tenantInvoices.length === 0 ? (
          <p>請求記録はまだありません。契約を「契約中」にして、月次利用を確定してください。</p>
        ) : (
          <div className="settings-stack">
            {billing.tenantInvoices.map((invoice) => (
              <section className="service-template-preview" key={invoice.id}>
                <h3>
                  {invoice.kind === 'SETUP_FEE'
                    ? `初期費用／${invoice.setupFeeCharge?.product.displayName ?? '商品確認要'}`
                    : invoice.periodStart.toISOString().slice(0, 7)}{' '}
                  / {yen(invoice.amountYen)}
                </h3>
                <p>
                  請求番号：{invoice.invoiceNumber} ／
                  {invoice.kind === 'SETUP_FEE'
                    ? ` 契約証跡：${invoice.setupFeeCharge?.agreementReference ?? '確認要'}`
                    : ` MAU：${invoice.mau.toLocaleString('ja-JP')}人`}{' '}
                  ／ 状態：
                  {invoiceStatusLabel(invoice.status, invoice.dueAt)}
                </p>
                {invoice.dueAt ? (
                  <p>
                    支払期限：
                    {invoice.dueAt.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' })}
                  </p>
                ) : null}
                {invoice.billingWebhookEvents.length > 0 ? (
                  <div className="notice notice--danger">
                    <strong>Stripe返金の要照合</strong>
                    <p>
                      内部請求状態は自動変更していません。Stripeの返金記録、契約証跡、会計処理を照合してください。
                    </p>
                    <ul>
                      {invoice.billingWebhookEvents.map((event) => (
                        <li key={event.id}>
                          {event.errorCategory === 'FULL_REFUND_REVIEW_REQUIRED'
                            ? '全額返金通知'
                            : '部分返金通知'}
                          ／受信：
                          {event.receivedAt.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
                          ／Stripe Event ID：<code>{event.providerEventId}</code>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {invoice.documentSnapshot && invoice.status !== 'DRAFT' ? (
                  <a
                    className="button button--secondary"
                    href={`/api/organizations/${billing.id}/invoices/${invoice.id}/document`}
                  >
                    請求書PDFをダウンロード
                  </a>
                ) : null}
                {invoice.status === 'DRAFT' ? (
                  <form className="form-stack" action={transitionInvoice}>
                    <input type="hidden" name="workspaceId" value={billing.id} />
                    <input type="hidden" name="invoiceId" value={invoice.id} />
                    <input type="hidden" name="action" value="ISSUE" />
                    <label className="field">
                      <span className="field__label">外部請求書番号（任意）</span>
                      <input
                        className="field__control"
                        name="externalInvoiceReference"
                        maxLength={200}
                      />
                    </label>
                    <label className="field">
                      <span className="field__label">メモ（任意）</span>
                      <input className="field__control" name="notes" maxLength={1000} />
                    </label>
                    <button className="button" type="submit">
                      請求済みにする
                    </button>
                  </form>
                ) : null}
                {invoice.status === 'ISSUED' ? (
                  <>
                    <form className="form-stack" action={sendInvoiceReminder}>
                      <input type="hidden" name="workspaceId" value={billing.id} />
                      <input type="hidden" name="invoiceId" value={invoice.id} />
                      <p>
                        送信先：{billing.organizationCommercialContract?.billingEmail ?? '未設定'}
                      </p>
                      <button className="button button--secondary" type="submit">
                        {invoice.dueAt && invoice.dueAt < new Date()
                          ? '期限超過の案内をメールする'
                          : '支払い案内をメールする'}
                      </button>
                    </form>
                    <form className="form-stack" action={transitionInvoice}>
                      <input type="hidden" name="workspaceId" value={billing.id} />
                      <input type="hidden" name="invoiceId" value={invoice.id} />
                      <input type="hidden" name="action" value="MARK_PAID" />
                      <label className="field">
                        <span className="field__label">入金参照番号（任意）</span>
                        <input className="field__control" name="paymentReference" maxLength={200} />
                      </label>
                      <button className="button" type="submit">
                        入金済みにする
                      </button>
                    </form>
                  </>
                ) : null}
                {invoice.status === 'DRAFT' || invoice.status === 'ISSUED' ? (
                  <form action={transitionInvoice}>
                    <input type="hidden" name="workspaceId" value={billing.id} />
                    <input type="hidden" name="invoiceId" value={invoice.id} />
                    <input type="hidden" name="action" value="VOID" />
                    <button className="button button--secondary" type="submit">
                      この請求を取り消す
                    </button>
                  </form>
                ) : null}
              </section>
            ))}
          </div>
        )}
      </section>

      <section className="settings-card">
        <h2>前月を請求用に確定</h2>
        <p>
          月末を過ぎた利用人数を保存します。一度確定した月は、後から利用履歴や権限が変わっても金額を変更しません。
        </p>
        <form action={finalizePreviousMonth}>
          <input type="hidden" name="workspaceId" value={dashboard.workspace.id} />
          <button className="button" type="submit">
            前月のMAUと料金を確定する
          </button>
        </form>
      </section>

      <section className="settings-card">
        <h2>確定履歴</h2>
        {dashboard.history.length === 0 ? (
          <p>確定済みの月はまだありません。</p>
        ) : (
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>対象月</th>
                  <th>MAU</th>
                  <th>料金</th>
                  <th>状態</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.history.map((row) => (
                  <tr key={row.month}>
                    <td>{row.month}</td>
                    <td>{row.mau.toLocaleString('ja-JP')}人</td>
                    <td>{yen(row.priceYen)}</td>
                    <td>{row.status === 'FINALIZED' ? '確定' : '集計中'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="settings-card">
        <h2>契約・請求の変更履歴</h2>
        {reminderFailures.length > 0 ? (
          <p className="notice notice--danger">
            未解決の自動案内メール送信失敗が{reminderFailures.length}
            件あります。管理者メール設定を確認し、対象請求の「支払い案内をメールする」から再送してください。再送に成功すると要確認表示は解消されます。
          </p>
        ) : null}
        {billing.commercialBillingAudits.length === 0 ? (
          <p>変更履歴はまだありません。</p>
        ) : (
          <ul className="summary-list">
            {billing.commercialBillingAudits.map((audit) => (
              <li key={audit.id}>
                <span>
                  {audit.entityType === 'CONTRACT' ? '契約' : '請求'}：
                  {{
                    CREATED: '作成',
                    AUTO_CREATED: '自動作成',
                    CUSTOM_CREATED: '個別見積で作成',
                    SETUP_FEE_CREATED: '初期費用の請求下書き作成',
                    UPDATED: '更新',
                    ISSUE: '請求済み',
                    MARK_PAID: '入金済み',
                    VOID: '取消',
                    PAYMENT_GUIDANCE_SENT: '支払い案内メール送信',
                    OVERDUE_REMINDER_SENT: '期限超過メール送信',
                    PAYMENT_GUIDANCE_FAILED: '支払い案内メール送信失敗',
                    OVERDUE_REMINDER_FAILED: '期限超過メール送信失敗',
                    BILLING_EMAIL_TEST_SENT: '請求先テストメール送信',
                    BILLING_EMAIL_TEST_FAILED: '請求先テストメール送信失敗',
                    DOCUMENT_DOWNLOADED: '請求書PDFダウンロード',
                  }[audit.action] ?? audit.action}
                </span>
                <strong>
                  {audit.occurredAt.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
                </strong>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
