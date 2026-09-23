import 'server-only';
import type { JobEnvironment, SocialImageGenerationRequestRecord } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { z } from 'zod';
import { currentUserProvider } from '../auth/current-user';

export const socialImageUuid = z.string().uuid();

export const socialImageJobEnvironment = {
  development: 'DEVELOPMENT',
  staging: 'STAGING',
  production: 'PRODUCTION',
} as const satisfies Record<string, JobEnvironment>;

export async function socialImageActorUserId() {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) throw new ApplicationError('UNAUTHENTICATED', 'session required');
  return actor.userId;
}

export async function parseSocialImageJsonBody(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new ApplicationError('VALIDATION_ERROR', 'application/json required');
  try {
    if (!request.body) throw new Error('empty body');
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 4_100_000) {
        await reader.cancel();
        throw new Error('body too large');
      }
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch (error) {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid JSON', error);
  }
}

export const socialImageRequestDto = (value: SocialImageGenerationRequestRecord) => ({
  id: value.id,
  status: value.status,
  templateKey: value.templateKey,
  layout: value.layout,
  revision: value.revision,
  errorCode: value.errorCode,
  createdAt: value.createdAt.toISOString(),
  updatedAt: value.updatedAt.toISOString(),
});
