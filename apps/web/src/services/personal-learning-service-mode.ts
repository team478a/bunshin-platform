import { isTrainingProgram } from './training-support-mode';

export interface PersonalLearningServiceProgram {
  status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED' | 'DRAFT';
  settings: unknown;
}

/** A suspended AI Training program still identifies the service's product mode. */
export function isPersonalLearningServiceProgram(program: PersonalLearningServiceProgram) {
  return (
    (program.status === 'ACTIVE' || program.status === 'SUSPENDED') &&
    isTrainingProgram(program.settings)
  );
}

export function isPersonalLearningProgramActive(program: PersonalLearningServiceProgram) {
  return program.status === 'ACTIVE' && isTrainingProgram(program.settings);
}
