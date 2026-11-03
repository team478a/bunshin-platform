import 'server-only';
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { getServerEnvironment } from '@bunshin/config';
import { ApplicationError } from '@bunshin/shared';
import type { SocialAccountTokenCrypto } from '@bunshin/database';

function key() {
  const environment = getServerEnvironment();
  if (!environment.ENCRYPTION_KEY)
    throw new ApplicationError('CONFIGURATION_ERROR', 'ENCRYPTION_KEY is required');
  return Buffer.from(
    hkdfSync(
      'sha256',
      Buffer.from(environment.ENCRYPTION_KEY, 'utf8'),
      Buffer.from(`bunshin:${environment.APP_ENV}`, 'utf8'),
      Buffer.from('social-account-token:aes-gcm:v1', 'utf8'),
      32,
    ),
  );
}

export function sealSocialAccountToken(token: string, context: readonly string[]): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(JSON.stringify(context), 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

export function openSocialAccountToken(value: string, context: readonly string[]): string {
  const [version, iv, tag, ciphertext] = value.split('.');
  if (version !== 'v1' || !iv || !tag || !ciphertext)
    throw new ApplicationError('CONFIGURATION_ERROR', 'Invalid SNS credential envelope');
  try {
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
    decipher.setAAD(Buffer.from(JSON.stringify(context), 'utf8'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch (error) {
    throw new ApplicationError(
      'CONFIGURATION_ERROR',
      'SNS credential authentication failed',
      error,
    );
  }
}

export const socialAccountTokenCrypto: SocialAccountTokenCrypto = {
  seal: sealSocialAccountToken,
  open: openSocialAccountToken,
};
