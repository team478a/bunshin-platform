import { isDeepStrictEqual } from 'node:util';
import {
  createAiTrainingV1Definition,
  AI_TRAINING_V1_MODULE_KEY,
} from '@bunshin/capability-training';
import { parseProgramDefinition, type ProgramDefinitionV1 } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';

// Infer the module only from the complete, server-owned published definition.
// Names, category strings and client-supplied settings are not module authority.
export function adoptedProgramSettings(
  rawDefinition: unknown,
  supportModes: ProgramDefinitionV1['supportModes'],
) {
  const definition = parseProgramDefinition(rawDefinition);
  if (supportModes.some((mode) => !definition.supportModes.includes(mode))) {
    throw new ApplicationError(
      'VALIDATION_ERROR',
      'support mode unavailable in published definition',
    );
  }
  const training = isDeepStrictEqual(definition, createAiTrainingV1Definition());
  if (!training && definition.missions.some((mission) => mission.capability === 'AI_TRAINING')) {
    throw new ApplicationError('VALIDATION_ERROR', 'unsupported training definition');
  }
  return {
    supportModes,
    participation: 'INVITATION_ONLY' as const,
    ...(training ? { moduleKey: AI_TRAINING_V1_MODULE_KEY } : {}),
  };
}
