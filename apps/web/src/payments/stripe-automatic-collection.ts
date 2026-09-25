import 'server-only';

import { ApplicationError } from '@bunshin/shared';
export class StripePaymentMethodRetrievalAdapter {
  async retrieve(secretKey: string, paymentIntentId: string) {
    if (!/^pi_[A-Za-z0-9_]+$/.test(paymentIntentId)) {
      throw new ApplicationError('VALIDATION_ERROR', 'invalid Stripe PaymentIntent identifier');
    }
    const response = await fetch(
      `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(paymentIntentId)}`,
      {
        headers: { authorization: `Bearer ${secretKey}` },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok) {
      throw new ApplicationError('INTERNAL_ERROR', '保存する支払方法を確認できませんでした');
    }
    const payload = (await response.json()) as {
      id?: unknown;
      status?: unknown;
      customer?: unknown;
      payment_method?: unknown;
    };
    if (
      payload.id !== paymentIntentId ||
      payload.status !== 'succeeded' ||
      typeof payload.customer !== 'string' ||
      !payload.customer.startsWith('cus_') ||
      typeof payload.payment_method !== 'string' ||
      !payload.payment_method.startsWith('pm_')
    ) {
      throw new ApplicationError('INTERNAL_ERROR', 'Stripeの支払方法情報が不完全です');
    }
    return { customerId: payload.customer, paymentMethodId: payload.payment_method };
  }
}

export type StripeAutomaticCollectionResult = {
  paymentIntentId: string | null;
  outcome: 'SUCCEEDED' | 'REQUIRES_ACTION' | 'FAILED';
  failureCategory: string | null;
};

export class StripeCommercialInvoiceCollectionAdapter {
  async collect(input: {
    secretKey: string;
    idempotencyKey: string;
    invoiceId: string;
    workspaceId: string;
    invoiceNumber: string;
    amountYen: number;
    customerId: string;
    paymentMethodId: string;
  }): Promise<StripeAutomaticCollectionResult> {
    if (!input.customerId.startsWith('cus_') || !input.paymentMethodId.startsWith('pm_')) {
      throw new ApplicationError('VALIDATION_ERROR', '保存済み支払方法が不正です');
    }
    const body = new URLSearchParams({
      amount: String(input.amountYen),
      currency: 'jpy',
      customer: input.customerId,
      payment_method: input.paymentMethodId,
      confirm: 'true',
      off_session: 'true',
      description: `ワタシワークス OEM月額利用料 ${input.invoiceNumber}`,
      'metadata[invoice_id]': input.invoiceId,
      'metadata[workspace_id]': input.workspaceId,
      'metadata[invoice_number]': input.invoiceNumber,
    });
    let response: Response;
    try {
      response = await fetch('https://api.stripe.com/v1/payment_intents', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${input.secretKey}`,
          'content-type': 'application/x-www-form-urlencoded',
          'idempotency-key': input.idempotencyKey,
        },
        body,
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      throw new ApplicationError('INTERNAL_ERROR', 'Stripe自動回収へ接続できませんでした', error);
    }
    const payload = (await response.json().catch(() => null)) as {
      id?: unknown;
      status?: unknown;
      error?: { code?: unknown; decline_code?: unknown };
    } | null;
    const paymentIntentId =
      typeof payload?.id === 'string' && payload.id.startsWith('pi_') ? payload.id : null;
    if (response.ok && payload?.status === 'succeeded' && paymentIntentId) {
      return { paymentIntentId, outcome: 'SUCCEEDED', failureCategory: null };
    }
    if (
      paymentIntentId &&
      ['requires_action', 'requires_payment_method', 'requires_confirmation'].includes(
        String(payload?.status),
      )
    ) {
      return {
        paymentIntentId,
        outcome: 'REQUIRES_ACTION',
        failureCategory: String(payload?.status).toUpperCase(),
      };
    }
    const category =
      typeof payload?.error?.decline_code === 'string'
        ? `DECLINED_${payload.error.decline_code.toUpperCase()}`
        : typeof payload?.error?.code === 'string'
          ? payload.error.code.toUpperCase()
          : response.status === 401 || response.status === 403
            ? 'CONFIGURATION_ERROR'
            : 'PROVIDER_ERROR';
    return { paymentIntentId, outcome: 'FAILED', failureCategory: category.slice(0, 80) };
  }
}
