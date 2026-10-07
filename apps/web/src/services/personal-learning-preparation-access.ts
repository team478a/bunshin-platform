import 'server-only';
import { getServerEnvironment } from '@bunshin/config';
import {
  parsePersonalLearningPreparationAuthority,
  type PersonalLearningPreparationAuthority,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';

type PreparationFlag =
  | 'PERSONAL_LEARNING_DEFINITION_ADMIN'
  | 'PERSONAL_LEARNING_PROFILE_PREPARATION'
  | 'PERSONAL_LEARNING_PARTICIPANT_PREPARATION';
export function personalLearningPreparationAccess(
  flag: PreparationFlag,
): PersonalLearningPreparationAuthority | undefined {
  const denied = () => new ApplicationError('NOT_FOUND', 'learning preparation unavailable');
  if (process.env[flag] !== 'true') throw denied();
  const environment = getServerEnvironment().APP_ENV;
  if (
    (environment === 'development' || environment === 'staging') &&
    flag !== 'PERSONAL_LEARNING_PARTICIPANT_PREPARATION'
  )
    return undefined;
  if (!['production', 'development', 'staging'].includes(environment)) throw denied();
  if (
    process.env['PERSONAL_LEARNING_PILOT'] === 'true' ||
    process.env['PERSONAL_LEARNING_PRODUCTION_CLOSED_PILOT'] === 'true'
  )
    throw denied();
  let value: unknown;
  try {
    value = JSON.parse(process.env['PERSONAL_LEARNING_PRODUCTION_PREPARATION'] ?? 'null');
  } catch {
    throw denied();
  }
  const authority = parsePersonalLearningPreparationAuthority(value);
  if (!authority) throw denied();
  return authority;
}

export function recheckPersonalLearningPreparationAccess(
  flag: PreparationFlag,
  previous: PersonalLearningPreparationAuthority | undefined,
) {
  const current = personalLearningPreparationAccess(flag);
  if (JSON.stringify(current) !== JSON.stringify(previous))
    throw new ApplicationError('NOT_FOUND', 'learning preparation changed');
}
