import 'server-only';
import { getServerEnvironment } from '@bunshin/config';
import { parsePersonalLearningPreparationAuthority } from '@bunshin/application';
import { personalLearningPreparationAccess } from './personal-learning-preparation-access';

/** UI availability only; API/repository reauthorize each read and write. */
export function participantConfigurationTarget(service: {
  workspaceId: string;
  serviceId: string;
}) {
  try {
    const authority = personalLearningPreparationAccess(
      'PERSONAL_LEARNING_PARTICIPANT_PREPARATION',
    );
    return authority &&
      authority.workspaceId === service.workspaceId &&
      authority.groupId === service.serviceId
      ? authority.serviceProgramId
      : null;
  } catch {
    return null;
  }
}

/** Presentation gate only: the existing HTTP and repository gates remain authoritative. */
export function programPreparationTarget(service: { workspaceId: string; serviceId: string }) {
  if (
    !['production', 'staging', 'development'].includes(getServerEnvironment().APP_ENV) ||
    process.env['PERSONAL_LEARNING_PILOT_OPERATIONS'] !== 'true' ||
    process.env['PERSONAL_LEARNING_PILOT'] === 'true' ||
    process.env['PERSONAL_LEARNING_PRODUCTION_CLOSED_PILOT'] === 'true'
  )
    return null;
  let raw: unknown;
  try {
    raw = JSON.parse(process.env['PERSONAL_LEARNING_PRODUCTION_PREPARATION'] ?? 'null');
  } catch {
    return null;
  }
  const authority = parsePersonalLearningPreparationAuthority(raw);
  if (
    !authority ||
    authority.workspaceId !== service.workspaceId ||
    authority.groupId !== service.serviceId
  )
    return null;
  return authority.serviceProgramId;
}
