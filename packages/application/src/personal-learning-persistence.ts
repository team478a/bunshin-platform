import { ApplicationError } from '@bunshin/shared';
import {
  defineLearnerScope,
  type LearnerScope,
  type ConfirmedLearningGoalReference,
} from './learning-profile-goal';
import type { LearningConsultationRequest } from './learning-consultation';
import { definePersonalLearningPlan, type PersonalLearningPlan } from './personal-learning-plan';

export interface PersonalLearningActor {
  readonly scope: LearnerScope;
  readonly actorUserId: string;
}
export interface PersonalLearningWrite extends PersonalLearningActor {
  readonly idempotencyKey: string;
}
export interface PersonalLearningReceipt {
  readonly goalId: string;
  readonly planId: string | null;
  readonly revision: number | null;
}
export interface PersonalLearningState {
  readonly goals: readonly {
    readonly reference: ConfirmedLearningGoalReference;
    readonly confirmedAt: string;
  }[];
  readonly plans: readonly {
    readonly plan: PersonalLearningPlan;
    readonly isCurrent: boolean;
    readonly goalActive: boolean;
    readonly createdAt: string;
    readonly confirmedAt: string | null;
  }[];
}
export interface PersonalLearningPersistenceRepository {
  confirmGoal(
    input: PersonalLearningWrite & { readonly consultation: LearningConsultationRequest },
  ): Promise<PersonalLearningReceipt>;
  savePlan(
    input: PersonalLearningWrite & {
      readonly plan: PersonalLearningPlan;
      readonly expectedRevision: number;
    },
  ): Promise<PersonalLearningReceipt>;
  confirmPlan(
    input: PersonalLearningWrite & { readonly planId: string; readonly expectedRevision: number },
  ): Promise<PersonalLearningReceipt>;
  read(input: PersonalLearningActor): Promise<PersonalLearningState>;
}
export function validatePersonalLearningActor(input: PersonalLearningActor): void {
  const scope = defineLearnerScope(input.scope);
  if (
    input.actorUserId !== scope.userId ||
    ![
      scope.workspaceId,
      scope.groupId,
      scope.programEnrollmentId,
      scope.groupMembershipId,
      scope.userId,
    ].every((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
  )
    throw new ApplicationError('FORBIDDEN', 'personal learning scope denied');
}
export function validatePersonalLearningWrite(input: PersonalLearningWrite): void {
  validatePersonalLearningActor(input);
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(input.idempotencyKey))
    throw new ApplicationError('VALIDATION_ERROR', 'invalid personal learning operation key');
}
/** Server-internal service. Repository MUST reauthorize and validate current evidence in its transaction. */
export class PersonalLearningPersistenceService implements PersonalLearningPersistenceRepository {
  constructor(private readonly repository: PersonalLearningPersistenceRepository) {}
  async confirmGoal(input: Parameters<PersonalLearningPersistenceRepository['confirmGoal']>[0]) {
    validatePersonalLearningWrite(input);
    return await this.repository.confirmGoal(input);
  }
  async savePlan(input: Parameters<PersonalLearningPersistenceRepository['savePlan']>[0]) {
    validatePersonalLearningWrite(input);
    const plan = definePersonalLearningPlan(input.plan);
    if (
      plan.status !== 'DRAFT' ||
      !Number.isSafeInteger(input.expectedRevision) ||
      input.expectedRevision < 0
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid draft revision');
    return await this.repository.savePlan({ ...input, plan });
  }
  async confirmPlan(input: Parameters<PersonalLearningPersistenceRepository['confirmPlan']>[0]) {
    validatePersonalLearningWrite(input);
    return await this.repository.confirmPlan(input);
  }
  async read(input: PersonalLearningActor) {
    validatePersonalLearningActor(input);
    return await this.repository.read(input);
  }
}
