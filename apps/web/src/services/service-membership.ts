import 'server-only';
import { ServiceParticipationService } from '@bunshin/application';

export async function recordServiceUse(serviceSlug: string, actorUserId: string) {
  const db = await import('@bunshin/database');
  return new ServiceParticipationService(new db.PrismaServiceParticipationRepository()).recordUse({
    slug: serviceSlug,
    actorUserId,
  });
}
