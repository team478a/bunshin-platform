export const purchaseStatusLabel = {
  CREATED: '受付準備中',
  CHECKOUT_OPEN: '支払い待ち',
  PAID: '入金済み',
  FAILED: '決済失敗',
  EXPIRED: '支払期限切れ',
  CANCELLED: '取消',
  REFUNDED: '全額返金済み',
} as const;

export type PurchaseStatus = keyof typeof purchaseStatusLabel;

export function yen(value: number): string {
  return `${value.toLocaleString('ja-JP')}円`;
}

export function paymentDate(value: Date | null): string {
  return (
    value?.toLocaleString('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }) ?? '未確定'
  );
}

export function paymentOperationsMessage(input: {
  failedWebhookCount: number;
  waitingPurchaseCount: number;
}): string {
  if (input.failedWebhookCount > 0) {
    return '決済通知の処理に失敗した記録があります。下の「要確認の決済通知」を確認してください。';
  }
  if (input.waitingPurchaseCount > 0) {
    return '支払い待ちの購入があります。購入者がStripeで支払いを終えると自動で入金済みに変わります。';
  }
  return '現在、運営者の確認が必要な決済はありません。';
}
