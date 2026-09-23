import {
  paymentDate,
  paymentOperationsMessage,
  purchaseStatusLabel,
  yen,
} from '../../../../../src/payments/payment-operations';
import type {
  FailedWebhookView,
  PaymentAction,
  RecentPurchaseView,
} from './organization-payment-types';

export function OrganizationPaymentOperations({
  workspaceId,
  summary,
  recentPurchases,
  failedWebhookEvents,
  reconcilePurchase,
  recoverWebhook,
}: {
  workspaceId: string;
  summary: {
    failedWebhookCount: number;
    waitingPurchaseCount: number;
    disputedPurchaseCount: number;
    paidPurchaseCount: number;
    refundedPurchaseCount: number;
    chargebackLostPurchaseCount: number;
    grossAmountYen: number;
    refundedAmountYen: number;
    disputedAmountYen: number;
    netAmountYen: number;
  };
  recentPurchases: RecentPurchaseView[];
  failedWebhookEvents: FailedWebhookView[];
  reconcilePurchase: PaymentAction;
  recoverWebhook: PaymentAction;
}) {
  return (
    <>
      <section className="settings-card" aria-labelledby="payment-operations-title">
        <h2 id="payment-operations-title">決済の運用状況</h2>
        <p>{paymentOperationsMessage(summary)}</p>
        <div className="operations-overview" aria-label="売上と購入状況">
          <div>
            <span>差引売上</span>
            <strong>{yen(summary.netAmountYen)}</strong>
          </div>
          <div>
            <span>決済完了総額</span>
            <strong>{yen(summary.grossAmountYen)}</strong>
          </div>
          <div>
            <span>返金総額</span>
            <strong>{yen(summary.refundedAmountYen)}</strong>
          </div>
          <div>
            <span>係争・チャージバック額</span>
            <strong>{yen(summary.disputedAmountYen)}</strong>
          </div>
          <div>
            <span>入金済み</span>
            <strong>{summary.paidPurchaseCount.toLocaleString('ja-JP')}件</strong>
          </div>
          <div>
            <span>支払い待ち</span>
            <strong>{summary.waitingPurchaseCount.toLocaleString('ja-JP')}件</strong>
          </div>
          <div>
            <span>全額返金</span>
            <strong>{summary.refundedPurchaseCount.toLocaleString('ja-JP')}件</strong>
          </div>
          <div>
            <span>カード会社の確認中</span>
            <strong>{summary.disputedPurchaseCount.toLocaleString('ja-JP')}件</strong>
          </div>
          <div>
            <span>チャージバック確定</span>
            <strong>{summary.chargebackLostPurchaseCount.toLocaleString('ja-JP')}件</strong>
          </div>
        </div>
      </section>

      <section className="settings-card" aria-labelledby="recent-purchases-title">
        <h2 id="recent-purchases-title">最近の購入</h2>
        <p>
          <a
            className="button button--secondary"
            href={`/api/organizations/${workspaceId}/payments/export`}
          >
            決済台帳をCSVで保存する
          </a>
        </p>
        {recentPurchases.length === 0 ? (
          <p>購入記録はまだありません。</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>受付日時</th>
                  <th>購入者</th>
                  <th>サービス</th>
                  <th>決済・返金</th>
                  <th>状態</th>
                  <th>状態更新日時</th>
                  <th>支払い確認</th>
                </tr>
              </thead>
              <tbody>
                {recentPurchases.map((purchase) => (
                  <tr key={purchase.id}>
                    <td>{paymentDate(purchase.createdAt)}</td>
                    <td>
                      {purchase.buyer.displayName}
                      {purchase.buyer.email ? <small>{purchase.buyer.email}</small> : null}
                    </td>
                    <td>{purchase.groupName}</td>
                    <td>
                      {yen(purchase.amountYen)}
                      {purchase.refundedAmountYen > 0 ? (
                        <small>返金 {yen(purchase.refundedAmountYen)}</small>
                      ) : null}
                      {purchase.disputedAmountYen > 0 ? (
                        <small>係争中・チャージバック {yen(purchase.disputedAmountYen)}</small>
                      ) : null}
                    </td>
                    <td>
                      {purchaseStatusLabel[purchase.status as keyof typeof purchaseStatusLabel] ??
                        purchase.status}
                      {purchase.disputeStatus ? (
                        <small>Stripe: {purchase.disputeStatus}</small>
                      ) : null}
                    </td>
                    <td>
                      {paymentDate(
                        purchase.refundedAt ??
                          purchase.disputeResolvedAt ??
                          purchase.disputedAt ??
                          purchase.paidAt ??
                          purchase.expiredAt ??
                          purchase.createdAt,
                      )}
                    </td>
                    <td>
                      {purchase.status === 'CHECKOUT_OPEN' ? (
                        <form action={reconcilePurchase} className="stack stack--compact">
                          <input type="hidden" name="workspaceId" value={workspaceId} />
                          <input type="hidden" name="purchaseId" value={purchase.id} />
                          <label>
                            <span className="sr-only">支払い状態を確認する理由</span>
                            <input
                              name="reason"
                              minLength={3}
                              maxLength={500}
                              required
                              placeholder="例：入金後も待機中のため"
                            />
                          </label>
                          <button className="button button--secondary" type="submit">
                            Stripeの状態を確認
                          </button>
                        </form>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="settings-card" aria-labelledby="failed-webhooks-title">
        <h2 id="failed-webhooks-title">要確認の決済通知</h2>
        {failedWebhookEvents.length === 0 ? (
          <p>処理に失敗した決済通知はありません。</p>
        ) : (
          <>
            <p>
              {summary.failedWebhookCount.toLocaleString('ja-JP')}
              件の失敗記録があります。Stripe側の問題や一時障害を解消した後、理由を入力して再処理できます。
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>受信日時</th>
                    <th>通知</th>
                    <th>エラー分類</th>
                    <th>再処理</th>
                  </tr>
                </thead>
                <tbody>
                  {failedWebhookEvents.map((event) => (
                    <tr key={event.id}>
                      <td>{paymentDate(event.receivedAt)}</td>
                      <td>{event.eventType}</td>
                      <td>{event.errorCategory ?? '詳細確認が必要'}</td>
                      <td>
                        <form action={recoverWebhook} className="stack stack--compact">
                          <input type="hidden" name="workspaceId" value={workspaceId} />
                          <input type="hidden" name="webhookEventId" value={event.id} />
                          <label>
                            <span className="sr-only">再処理する理由</span>
                            <input
                              name="reason"
                              minLength={3}
                              maxLength={500}
                              required
                              placeholder="例：Stripe接続を修正済み"
                            />
                          </label>
                          <button className="button button--secondary" type="submit">
                            Stripeから再取得して処理
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </>
  );
}
