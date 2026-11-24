import 'server-only';
import type { PersonalLearningActor } from '@bunshin/application';
import {
  personalLearningDynamicProgramAllows,
  personalLearningFeatureEnabled,
  personalLearningOfferPolicy,
} from '@bunshin/capability-training';
import { getServerEnvironment } from '@bunshin/config';
import { ApplicationError } from '@bunshin/shared';
import { currentUserProvider } from '../auth/current-user';
import { resolveAuthenticatedMemberServicePage } from './member-service-page';
import { resolvePersonalLearningRequestActor } from './personal-learning-request-access';

export function browserLearningDevelopment() {
  return getServerEnvironment().APP_ENV === 'development';
}

export function browserLearningProgram(settings: unknown, enrollmentId: string) {
  return (
    browserLearningDevelopment() &&
    personalLearningDynamicProgramAllows(settings, enrollmentId) &&
    personalLearningFeatureEnabled(settings, 'browserMaterials') &&
    personalLearningOfferPolicy(settings) === 'AI_SKILL_V1'
  );
}

export function learningMaterialPath(slug: string, enrollment: string, topic?: string) {
  const query = topic ? `?topicId=${encodeURIComponent(topic)}` : '';
  return `/s/${encodeURIComponent(slug)}/programs/${encodeURIComponent(enrollment)}/learning-request/browser-material${query}` as const;
}

export async function browserLearningMaterialActor(
  slug: string,
  enrollment: string,
  topic?: string,
  redirectToLogin = false,
) {
  if (!browserLearningDevelopment())
    throw new ApplicationError('NOT_FOUND', 'material unavailable');
  const current = redirectToLogin
    ? (
        await resolveAuthenticatedMemberServicePage(
          slug,
          learningMaterialPath(slug, enrollment, topic),
        )
      ).actor
    : await (await currentUserProvider()).getCurrentUser();
  if (!current) throw new ApplicationError('NOT_FOUND', 'material unavailable');
  return resolvePersonalLearningRequestActor(
    slug,
    enrollment,
    current.userId,
    'browserMaterials',
    topic,
  );
}

export async function enqueueBrowserLearningMaterial(actor: PersonalLearningActor) {
  const db = await import('@bunshin/database');
  return new db.PrismaBrowserLearningMaterials(db.prisma).enqueue(actor);
}
