import 'server-only';
export class StripeAccountConnectionTestAdapter {
  async validate(secretKey: string): Promise<{
    success: boolean;
    accountReference: string | null;
    errorCategory: string | null;
  }> {
    try {
      const response = await fetch('https://api.stripe.com/v1/account', {
        headers: { authorization: `Bearer ${secretKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (response.ok) {
        const payload = (await response.json()) as { id?: unknown };
        return {
          success: typeof payload.id === 'string' && payload.id.startsWith('acct_'),
          accountReference:
            typeof payload.id === 'string' && payload.id.startsWith('acct_') ? payload.id : null,
          errorCategory:
            typeof payload.id === 'string' && payload.id.startsWith('acct_')
              ? null
              : 'PROVIDER_RESPONSE_INVALID',
        };
      }
      if (response.status === 401 || response.status === 403)
        return { success: false, accountReference: null, errorCategory: 'CREDENTIAL_INVALID' };
      if (response.status === 429)
        return { success: false, accountReference: null, errorCategory: 'QUOTA_OR_RATE_LIMIT' };
      return { success: false, accountReference: null, errorCategory: 'PROVIDER_UNAVAILABLE' };
    } catch {
      return { success: false, accountReference: null, errorCategory: 'PROVIDER_UNAVAILABLE' };
    }
  }
}
