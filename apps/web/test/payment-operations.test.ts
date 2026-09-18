import { describe, expect, it } from 'vitest';
import {
  paymentDate,
  paymentOperationsMessage,
  purchaseStatusLabel,
  yen,
} from '../src/payments/payment-operations';

describe('payment operations presentation', () => {
  it('uses operator-friendly purchase labels', () => {
    expect(purchaseStatusLabel.PAID).toBe('入金済み');
    expect(purchaseStatusLabel.REFUNDED).toBe('全額返金済み');
    expect(purchaseStatusLabel.CHECKOUT_OPEN).toBe('支払い待ち');
  });

  it('prioritizes failed webhook guidance over waiting purchases', () => {
    expect(paymentOperationsMessage({ failedWebhookCount: 1, waitingPurchaseCount: 3 })).toContain(
      '処理に失敗',
    );
    expect(paymentOperationsMessage({ failedWebhookCount: 0, waitingPurchaseCount: 3 })).toContain(
      '支払い待ち',
    );
    expect(paymentOperationsMessage({ failedWebhookCount: 0, waitingPurchaseCount: 0 })).toContain(
      '確認が必要な決済はありません',
    );
  });

  it('formats money and dates for Japanese operations', () => {
    expect(yen(29800)).toBe('29,800円');
    expect(paymentDate(null)).toBe('未確定');
    expect(paymentDate(new Date('2026-09-18T01:30:00.000Z'))).toContain('2026');
  });
});
