import 'server-only';
import { ApplicationError } from '@bunshin/shared';
import { resolveManagedServiceContext } from '../services/public-service';

export async function fortuneOperatorScope(serviceSlug: string, actorUserId: string) {
  try {
    return await resolveManagedServiceContext(serviceSlug, actorUserId);
  } catch (error) {
    if (error instanceof Error && error.message === 'SERVICE_NOT_FOUND')
      throw new ApplicationError('NOT_FOUND', 'service not found');
    throw error;
  }
}
