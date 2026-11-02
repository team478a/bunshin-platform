import 'server-only';
import { createClient } from '@supabase/supabase-js';
import {
  ExternalReadError,
  type ExternalReadCredentialVerifier,
  type ExternalReadEnvironment,
  type VerifiedExternalReadCredential,
} from '@bunshin/application';
import { z } from 'zod';
interface Configuration {
  url: string;
  key: string;
  environment: ExternalReadEnvironment;
  clientIds: readonly string[];
}
const claimsSchema = z.object({
  iss: z.string(),
  aud: z.literal('authenticated'),
  role: z.literal('authenticated'),
  sub: z.uuid(),
  session_id: z.uuid(),
  client_id: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().positive(),
  nbf: z.number().int().optional(),
});
function active(signal: AbortSignal) {
  if (signal.aborted) throw new ExternalReadError('TIMEOUT');
}
function checkError(error: { name: string; status?: number | undefined }) {
  if (
    error.name === 'AuthRetryableFetchError' ||
    (error.status !== undefined && error.status >= 500)
  )
    throw new ExternalReadError('UNAVAILABLE');
}
/** Cookie-free OAuth credential verification; never signs in, refreshes or provisions an account. */
export class SupabaseExternalReadCredentialVerifier implements ExternalReadCredentialVerifier {
  private readonly issuer: string;
  constructor(
    private readonly config: Configuration,
    private readonly request: typeof fetch = fetch,
    private readonly now: () => Date = () => new Date(),
  ) {
    const url = new URL(config.url);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/' ||
      (url.protocol !== 'https:' &&
        !(
          config.environment !== 'production' &&
          url.protocol === 'http:' &&
          ['127.0.0.1', 'localhost'].includes(url.hostname)
        ))
    )
      throw new ExternalReadError('UNAVAILABLE');
    this.issuer = `${url.origin}/auth/v1`;
  }
  async verify(
    authorization: string,
    signal: AbortSignal,
  ): Promise<VerifiedExternalReadCredential | null> {
    active(signal);
    if (!this.config.clientIds.length || authorization.length > 8192) return null;
    const matched = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(
      authorization,
    );
    if (!matched?.[1]) return null;
    const token = matched[1];
    try {
      const client = createClient(this.config.url, this.config.key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { fetch: (input, init) => this.request(input, { ...init, signal }) },
      });
      const claimsResult = await client.auth.getClaims(token);
      active(signal);
      if (claimsResult.error) {
        checkError(claimsResult.error);
        return null;
      }
      const parsed = claimsSchema.safeParse(claimsResult.data?.claims);
      if (!parsed.success) return null;
      const claims = parsed.data;
      const seconds = () => {
        const time = this.now().getTime();
        if (!Number.isFinite(time)) throw new ExternalReadError('UNAVAILABLE');
        return Math.floor(time / 1000);
      };
      if (
        claims.iss !== this.issuer ||
        !this.config.clientIds.includes(claims.client_id) ||
        claims.exp <= seconds() ||
        claims.iat > seconds() ||
        claims.exp <= claims.iat ||
        (claims.nbf !== undefined && claims.nbf > seconds())
      )
        return null;
      const userResult = await client.auth.getUser(token);
      active(signal);
      if (userResult.error) {
        checkError(userResult.error);
        return null;
      }
      if (
        !userResult.data.user ||
        userResult.data.user.id !== claims.sub ||
        claims.exp <= seconds()
      )
        return null;
      return {
        issuer: this.issuer,
        subject: claims.sub,
        sessionId: claims.session_id,
        clientId: claims.client_id,
        environment: this.config.environment,
        expiresAt: new Date(claims.exp * 1000),
      };
    } catch (error) {
      if (error instanceof ExternalReadError) throw error;
      throw new ExternalReadError('UNAVAILABLE');
    }
  }
}
