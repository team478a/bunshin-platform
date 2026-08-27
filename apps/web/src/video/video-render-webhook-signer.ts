import 'server-only';
import type { VideoRenderWebhookPort } from '@bunshin/application';
import { getServerEnvironment } from '@bunshin/config';
import { ApplicationError } from '@bunshin/shared';
import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';

type RuntimeEnvironment = 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION';
interface Claims {
  purpose: 'video-render-webhook';
  workspaceId: string;
  renderId: string;
  environment: RuntimeEnvironment;
  keyVersion: number;
  expiresAt: number;
}

const environments = {
  development: 'DEVELOPMENT',
  staging: 'STAGING',
  production: 'PRODUCTION',
} as const;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const invalid = () => new ApplicationError('FORBIDDEN', 'invalid video render webhook state');

function signingKey(version: number) {
  const environment = getServerEnvironment();
  if (!environment.ENCRYPTION_KEY)
    throw new ApplicationError('CONFIGURATION_ERROR', 'ENCRYPTION_KEY is required');
  return Buffer.from(
    hkdfSync(
      'sha256',
      Buffer.from(environment.ENCRYPTION_KEY, 'utf8'),
      Buffer.from(`watashi-works:${environment.APP_ENV}`, 'utf8'),
      Buffer.from(`video-render-webhook:hmac-sha256:v${version}`, 'utf8'),
      32,
    ),
  );
}

function sign(payload: string, version: number) {
  return createHmac('sha256', signingKey(version)).update(payload, 'utf8').digest();
}

function parsePayload(payload: string): Claims {
  try {
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Claims;
    if (
      value.purpose !== 'video-render-webhook' ||
      !uuid.test(value.workspaceId) ||
      !uuid.test(value.renderId) ||
      !Object.values(environments).includes(value.environment) ||
      !Number.isInteger(value.keyVersion) ||
      value.keyVersion < 1 ||
      !Number.isInteger(value.expiresAt)
    )
      throw invalid();
    return value;
  } catch (error) {
    if (error instanceof ApplicationError) throw error;
    throw invalid();
  }
}

export class HkdfVideoRenderWebhookSigner implements VideoRenderWebhookPort {
  constructor(
    private readonly now = () => new Date(),
    private readonly lifetimeSeconds = 48 * 60 * 60,
  ) {}

  createUrl(input: { workspaceId: string; renderId: string }): Promise<string> {
    const environment = getServerEnvironment();
    const claims: Claims = {
      purpose: 'video-render-webhook',
      workspaceId: input.workspaceId,
      renderId: input.renderId,
      environment: environments[environment.APP_ENV],
      keyVersion: environment.VIDEO_RENDER_WEBHOOK_KEY_VERSION,
      expiresAt: Math.floor(this.now().getTime() / 1000) + this.lifetimeSeconds,
    };
    const payload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
    const token = `${payload}.${sign(payload, claims.keyVersion).toString('base64url')}`;
    return Promise.resolve(
      new URL(`/api/video-renders/webhook?state=${token}`, environment.APP_URL).toString(),
    );
  }

  verify(token: string): Claims {
    if (!token || token.length > 2_048) throw invalid();
    const [payload, encodedSignature, extra] = token.split('.');
    if (!payload || !encodedSignature || extra) throw invalid();
    const claims = parsePayload(payload);
    const environment = getServerEnvironment();
    const currentVersion = environment.VIDEO_RENDER_WEBHOOK_KEY_VERSION;
    if (
      claims.environment !== environments[environment.APP_ENV] ||
      claims.keyVersion > currentVersion ||
      claims.keyVersion < Math.max(1, currentVersion - 1) ||
      claims.expiresAt < Math.floor(this.now().getTime() / 1000)
    )
      throw invalid();
    const expected = sign(payload, claims.keyVersion);
    const provided = Buffer.from(encodedSignature, 'base64url');
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected))
      throw invalid();
    return claims;
  }
}
