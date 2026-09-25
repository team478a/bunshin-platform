import 'server-only';

import { ApplicationError } from '@bunshin/shared';
export type StripeCheckoutSession = {
  id: string;
  url: string;
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
      typeof payload.url !== 'string' ||
      !payload.url.startsWith('https://checkout.stripe.com/')
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

export class StripeCommercialInvoiceCheckoutAdapter {
  async create(input: {
    secretKey: string;
    idempotencyKey: string;
    invoiceId: string;
    workspaceId: string;
    invoiceNumber: string;
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
      'line_items[0][price_data][product_data][name]': `ワタシワークス OEM月額利用料 ${input.invoiceNumber}`,
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
        '月額利用料のStripe Checkoutを開始できませんでした',
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
      typeof payload.url !== 'string' ||
      !payload.url.startsWith('https://checkout.stripe.com/')
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
