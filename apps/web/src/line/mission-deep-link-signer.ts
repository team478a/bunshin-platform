import 'server-only';
import type {
  LineConfigurationEnvironment,
  MissionDeepLinkClaims,
  MissionDeepLinkSignerPort,
} from '@bunshin/application';
import { getServerEnvironment } from '@bunshin/config';
import { ApplicationError } from '@bunshin/shared';
import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import { currentLineEnvironment } from './secure-configuration';

interface SerializedClaims {
  purpose: 'mission-deep-link';
  jti: string;
  env: LineConfigurationEnvironment;
  kv: number;
  exp: number;
}

const invalidState = () =>
  new ApplicationError('FORBIDDEN', 'invalid Mission deep link state signature');

function keyFor(version: number): Buffer {
  const environment = getServerEnvironment();
  if (!environment.ENCRYPTION_KEY)
    throw new ApplicationError('CONFIGURATION_ERROR', 'ENCRYPTION_KEY is required');
  return Buffer.from(
    hkdfSync(
      'sha256',
      Buffer.from(environment.ENCRYPTION_KEY, 'utf8'),
      Buffer.from(`bunshin:${environment.APP_ENV}`, 'utf8'),
      Buffer.from(`line-mission-deep-link:hmac-sha256:v${version}`, 'utf8'),
      32,
    ),
  );
}

function signature(payload: string, version: number): Buffer {
  return createHmac('sha256', keyFor(version)).update(payload, 'utf8').digest();
}

function parsePayload(payload: string): SerializedClaims {
  try {
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    if (
      Object.keys(value).length !== 5 ||
      value['purpose'] !== 'mission-deep-link' ||
      typeof value['jti'] !== 'string' ||
      !['DEVELOPMENT', 'STAGING', 'PRODUCTION'].includes(String(value['env'])) ||
      !Number.isInteger(value['kv']) ||
      Number(value['kv']) < 1 ||
      !Number.isInteger(value['exp']) ||
      Number(value['exp']) < 1
    )
      throw invalidState();
    return value as unknown as SerializedClaims;
  } catch (error) {
    if (error instanceof ApplicationError) throw error;
    throw invalidState();
  }
}

export class HkdfMissionDeepLinkSigner implements MissionDeepLinkSignerPort {
  sign(claims: MissionDeepLinkClaims): Promise<string> {
    return Promise.resolve().then(() => this.signNow(claims));
  }

  private signNow(claims: MissionDeepLinkClaims): string {
    const currentVersion = getServerEnvironment().LINE_DEEP_LINK_KEY_VERSION;
    if (claims.environment !== currentLineEnvironment() || claims.keyVersion !== currentVersion)
      throw new ApplicationError('FORBIDDEN', 'Mission deep link signing context mismatch');
    const serialized: SerializedClaims = {
      purpose: 'mission-deep-link',
      jti: claims.stateId,
      env: claims.environment,
      kv: claims.keyVersion,
      exp: claims.expiresAtEpochSeconds,
    };
    const payload = Buffer.from(JSON.stringify(serialized), 'utf8').toString('base64url');
    return `${payload}.${signature(payload, claims.keyVersion).toString('base64url')}`;
  }

  verify(token: string): Promise<MissionDeepLinkClaims> {
    return Promise.resolve().then(() => this.verifyNow(token));
  }

  private verifyNow(token: string): MissionDeepLinkClaims {
    if (token.length < 1 || token.length > 2_048) throw invalidState();
    const parts = token.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) throw invalidState();
    const claims = parsePayload(parts[0]);
    const environment = getServerEnvironment();
    const currentVersion = environment.LINE_DEEP_LINK_KEY_VERSION;
    if (
      claims.env !== currentLineEnvironment() ||
      claims.kv > currentVersion ||
      claims.kv < Math.max(1, currentVersion - 1)
    )
      throw invalidState();
    let provided: Buffer;
    try {
      provided = Buffer.from(parts[1], 'base64url');
    } catch {
      throw invalidState();
    }
    const expected = signature(parts[0], claims.kv);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected))
      throw invalidState();
    return {
      stateId: claims.jti,
      environment: claims.env,
      keyVersion: claims.kv,
      expiresAtEpochSeconds: claims.exp,
    };
  }
}
