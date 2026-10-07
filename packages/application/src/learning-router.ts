import type { LearningDefinitionReference } from './personal-learning-plan';
import type { PersonalLearningWrite } from './personal-learning-persistence';

/** Selection only: not a Goal, Plan or Enrollment lifecycle transition. */
export interface LearningRouterResult {
  readonly status: 'NEXT' | 'REVIEW' | 'RETRY' | 'BLOCKED' | 'PLAN_COMPLETED' | 'UNKNOWN';
  readonly reason: string;
  readonly ruleVersion: string;
  readonly definition: LearningDefinitionReference | null;
}
export interface LearningRouterBridgeRequest extends PersonalLearningWrite {
  readonly planId: string;
  readonly expectedRevision: number;
}
export interface LearningRouterBridgeReceipt {
  readonly result: LearningRouterResult;
  readonly assignmentId: string | null;
}
export interface PersonalLearningRouterBridge {
  /** Explicit, authenticated operation; never registered with the legacy scheduler. */
  bridge(input: LearningRouterBridgeRequest): Promise<LearningRouterBridgeReceipt>;
}
