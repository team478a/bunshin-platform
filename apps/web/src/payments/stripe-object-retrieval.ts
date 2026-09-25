import 'server-only';

import { ApplicationError } from '@bunshin/shared';
export class StripeCheckoutSessionRetrievalAdapter {
  async retrieve(secretKey: string, sessionId: string): Promise<unknown> {
    if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
      throw new ApplicationError('VALIDATION_ERROR', 'invalid Stripe Checkout identifier');
    }
    let response: Response;
    try {
      response = await fetch(
        `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
        {
          headers: { authorization: `Bearer ${secretKey}` },
          signal: AbortSignal.timeout(10_000),
        },
      );
    } catch (error) {
      throw new ApplicationError('INTERNAL_ERROR', 'Stripe Checkout retrieval failed', error);
    }
    if (!response.ok) {
      throw new ApplicationError(
        response.status === 401 || response.status === 403
          ? 'CONFIGURATION_ERROR'
          : response.status === 404
            ? 'NOT_FOUND'
            : 'INTERNAL_ERROR',
        'Stripe Checkout retrieval failed',
      );
    }
    return response.json();
  }
}

export class StripeEventRetrievalAdapter {
  async retrieve(secretKey: string, eventId: string): Promise<unknown> {
    if (!/^evt_[A-Za-z0-9]+$/.test(eventId)) {
      throw new ApplicationError('VALIDATION_ERROR', 'invalid Stripe event identifier');
    }
    let response: Response;
    try {
      response = await fetch(`https://api.stripe.com/v1/events/${encodeURIComponent(eventId)}`, {
        headers: { authorization: `Bearer ${secretKey}` },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      throw new ApplicationError('INTERNAL_ERROR', 'Stripe event retrieval failed', error);
    }
    if (!response.ok) {
      throw new ApplicationError(
        response.status === 401 || response.status === 403
          ? 'CONFIGURATION_ERROR'
          : response.status === 404
            ? 'NOT_FOUND'
            : 'INTERNAL_ERROR',
        'Stripe event retrieval failed',
      );
    }
    return response.json();
  }
}
