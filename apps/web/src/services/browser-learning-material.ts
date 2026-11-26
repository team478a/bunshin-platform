import 'server-only';
import type { PersonalLearningActor } from '@bunshin/application';
import {
  browserPilotEnvironment,
  type BrowserMaterialAzureVoice,
} from '@bunshin/capability-browser';
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

export function browserLearningPilotAvailable() {
  return browserPilotEnvironment(getServerEnvironment().APP_ENV) !== null;
}

export function browserLearningProgram(settings: unknown, enrollmentId: string) {
  return (
    browserLearningPilotAvailable() &&
    personalLearningDynamicProgramAllows(settings, enrollmentId) &&
    personalLearningFeatureEnabled(settings, 'browserMaterials') &&
    personalLearningOfferPolicy(settings) === 'AI_SKILL_V1'
  );
}

export function learningMaterialPath(
  slug: string,
  enrollment: string,
  topic?: string,
  narrator?: BrowserMaterialAzureVoice | null,
) {
  const query = [
    topic && `topicId=${encodeURIComponent(topic)}`,
    narrator && `narrator=${narrator}`,
  ]
    .filter(Boolean)
    .join('&');
  return `/s/${encodeURIComponent(slug)}/programs/${encodeURIComponent(enrollment)}/learning-request/browser-material${query ? `?${query}` : ''}` as const;
}

export async function browserLearningMaterialActor(
  slug: string,
  enrollment: string,
  topic?: string,
  redirectToLogin = false,
) {
  if (!browserLearningPilotAvailable())
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

export async function enqueueBrowserLearningMaterial(
  actor: PersonalLearningActor,
  retryFailedJobId?: string,
) {
  const db = await import('@bunshin/database');
  return new db.PrismaBrowserLearningMaterials(db.prisma).enqueue(actor, retryFailedJobId);
}
