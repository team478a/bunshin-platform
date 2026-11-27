import 'server-only';

import { ApplicationError } from '@bunshin/shared';
import { INSTRUCTOR_REVIEW_KIND } from '../services/instructor-review-contract';
type StripeCheckoutUrl = `https://checkout.stripe.com/${string}`;

export function isStripeCheckoutUrl(value: unknown): value is StripeCheckoutUrl {
  return typeof value === 'string' && value.startsWith('https://checkout.stripe.com/');
}

export type StripeCheckoutSession = {
  id: string;
  url: StripeCheckoutUrl;
  expiresAt: Date | null;
};

export class StripeCheckoutAdapter {
  async create(input: {
    secretKey: string;
    idempotencyKey: string;
    purchaseId: string;
    workspaceId: string;
    offeringId: string;
    productName: string;
    amountYen: number;
    successUrl: string;
    cancelUrl: string;
    fortune?: { terms: string };
    instructorReview?: { terms: string };
  }): Promise<StripeCheckoutSession> {
    const body = new URLSearchParams({
      mode: 'payment',
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: input.purchaseId,
      'line_items[0][price_data][currency]': 'jpy',
      'line_items[0][price_data][unit_amount]': String(input.amountYen),
      'line_items[0][price_data][product_data][name]': input.productName,
      'line_items[0][quantity]': '1',
      'metadata[purchase_id]': input.purchaseId,
      'metadata[workspace_id]': input.workspaceId,
      'metadata[offering_id]': input.offeringId,
      'payment_intent_data[metadata][purchase_id]': input.purchaseId,
      'payment_intent_data[metadata][workspace_id]': input.workspaceId,
    });
    const supplementalPurchase = input.instructorReview ?? input.fortune;
    if (supplementalPurchase) {
      const purchaseKind = input.instructorReview ? INSTRUCTOR_REVIEW_KIND : 'fortune';
      body.set('payment_method_types[0]', 'card');
      body.set('metadata[purchase_kind]', purchaseKind);
      body.set('payment_intent_data[metadata][purchase_kind]', purchaseKind);
      body.set('custom_text[submit][message]', supplementalPurchase.terms);
    }
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${input.secretKey}`,
        'content-type': 'application/x-www-form-urlencoded',
        'idempotency-key': input.idempotencyKey,
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new ApplicationError(
        response.status === 401 || response.status === 403
          ? 'CONFIGURATION_ERROR'
          : 'INTERNAL_ERROR',
        'Stripe Checkoutを開始できませんでした',
      );
    }
    const payload = (await response.json()) as {
      id?: unknown;
      url?: unknown;
      expires_at?: unknown;
    };
    if (
      typeof payload.id !== 'string' ||
      !payload.id.startsWith('cs_') ||
      !isStripeCheckoutUrl(payload.url)
    ) {
      throw new ApplicationError('INTERNAL_ERROR', 'Stripe response is invalid');
    }
    return {
      id: payload.id,
      url: payload.url,
      expiresAt:
        typeof payload.expires_at === 'number' ? new Date(payload.expires_at * 1000) : null,
    };
  }
}

export class StripeCheckoutExpirationAdapter {
  async expire(secretKey: string, sessionId: string, idempotencyKey: string): Promise<void> {
    if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
      throw new ApplicationError('VALIDATION_ERROR', 'invalid Stripe Checkout identifier');
    }
    const response = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}/expire`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${secretKey}`, 'idempotency-key': idempotencyKey },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok) {
      throw new ApplicationError('CONFLICT', '決済の取消を確認できませんでした');
    }
    const payload = (await response.json()) as { id?: unknown; status?: unknown };
    if (payload.id !== sessionId || payload.status !== 'expired') {
      throw new ApplicationError('INTERNAL_ERROR', 'Stripe cancellation response is invalid');
    }
  }
}

export class StripeFullRefundAdapter {
  async request(secretKey: string, paymentIntentId: string, idempotencyKey: string): Promise<void> {
    if (!/^pi_[A-Za-z0-9]+$/.test(paymentIntentId)) {
      throw new ApplicationError('VALIDATION_ERROR', 'invalid Stripe payment identifier');
    }
    const response = await fetch('https://api.stripe.com/v1/refunds', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secretKey}`,
        'content-type': 'application/x-www-form-urlencoded',
        'idempotency-key': idempotencyKey,
      },
      body: new URLSearchParams({ payment_intent: paymentIntentId }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new ApplicationError('CONFLICT', '返金の依頼を受理できませんでした');
    }
    const payload = (await response.json()) as { payment_intent?: unknown; status?: unknown };
    if (
      payload.payment_intent !== paymentIntentId ||
      (payload.status !== 'succeeded' && payload.status !== 'pending')
    ) {
      throw new ApplicationError('INTERNAL_ERROR', 'Stripe refund response is invalid');
    }
  }
}

export class StripeCommercialInvoiceCheckoutAdapter {
  async create(input: {
    secretKey: string;
    idempotencyKey: string;
    invoiceId: string;
    workspaceId: string;
    invoiceNumber: string;
    itemName: string;
    billingEmail: string;
    amountYen: number;
    successUrl: string;
    cancelUrl: string;
    savePaymentMethod?: boolean;
    customerId?: string | null;
  }): Promise<StripeCheckoutSession> {
    const body = new URLSearchParams({
      mode: 'payment',
      'payment_method_types[0]': 'card',
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: input.invoiceId,
      'invoice_creation[enabled]': 'true',
      'line_items[0][price_data][currency]': 'jpy',
      'line_items[0][price_data][unit_amount]': String(input.amountYen),
      'line_items[0][price_data][product_data][name]': input.itemName,
      'line_items[0][quantity]': '1',
      'metadata[invoice_id]': input.invoiceId,
      'metadata[workspace_id]': input.workspaceId,
      'metadata[invoice_number]': input.invoiceNumber,
      'payment_intent_data[metadata][invoice_id]': input.invoiceId,
      'payment_intent_data[metadata][workspace_id]': input.workspaceId,
    });
    if (input.customerId) body.set('customer', input.customerId);
    else {
      body.set('customer_email', input.billingEmail);
      if (input.savePaymentMethod) body.set('customer_creation', 'always');
    }
    if (input.savePaymentMethod) {
      body.set('payment_intent_data[setup_future_usage]', 'off_session');
    }
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${input.secretKey}`,
        'content-type': 'application/x-www-form-urlencoded',
        'idempotency-key': input.idempotencyKey,
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new ApplicationError(
        response.status === 401 || response.status === 403
          ? 'CONFIGURATION_ERROR'
          : 'INTERNAL_ERROR',
        '請求のStripe Checkoutを開始できませんでした',
      );
    }
    const payload = (await response.json()) as {
      id?: unknown;
      url?: unknown;
      expires_at?: unknown;
    };
    if (
      typeof payload.id !== 'string' ||
      !payload.id.startsWith('cs_') ||
      !isStripeCheckoutUrl(payload.url)
    ) {
      throw new ApplicationError('INTERNAL_ERROR', 'Stripe response is invalid');
    }
    return {
      id: payload.id,
      url: payload.url,
      expiresAt:
        typeof payload.expires_at === 'number' ? new Date(payload.expires_at * 1000) : null,
    };
  }
}
