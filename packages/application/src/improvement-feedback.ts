import { ApplicationError } from '@bunshin/shared';

/** User reports are signals, not a confirmed bug or an improvement candidate. */
export const IMPROVEMENT_FEEDBACK_CATEGORIES = [
  'OPERATION',
  'CONTENT',
  'WAITING',
  'OTHER',
] as const;
export const IMPROVEMENT_FEEDBACK_SURFACES = [
  'SETUP',
  'TODAY',
  'PHOTO',
  'VIDEO',
  'NOTIFICATION',
  'OTHER',
] as const;
export const IMPROVEMENT_FEEDBACK_IMPACTS = ['BLOCKED', 'DIFFICULT', 'SUGGESTION'] as const;
export interface ImprovementFeedbackInput {
  workspaceId: string;
  serviceId: string;
  bunshinId: string;
  actorUserId: string;
  packageKey: 'SOCIAL';
  submissionKey: string;
  category: (typeof IMPROVEMENT_FEEDBACK_CATEGORIES)[number];
  surface: (typeof IMPROVEMENT_FEEDBACK_SURFACES)[number];
  impact: (typeof IMPROVEMENT_FEEDBACK_IMPACTS)[number];
}
export interface ImprovementFeedbackReceipt {
  id: string;
  createdAt: Date;
}
export interface ImprovementFeedbackRepository {
  /** Reauthorize inside persistence; same key + different scope/payload must conflict. */
  record(input: ImprovementFeedbackInput): Promise<ImprovementFeedbackReceipt>;
}
export function validateImprovementFeedback(input: ImprovementFeedbackInput): void {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (
    ![
      input.workspaceId,
      input.serviceId,
      input.bunshinId,
      input.actorUserId,
      input.submissionKey,
    ].every((id) => uuid.test(id)) ||
    input.packageKey !== 'SOCIAL' ||
    !IMPROVEMENT_FEEDBACK_CATEGORIES.includes(input.category) ||
    !IMPROVEMENT_FEEDBACK_SURFACES.includes(input.surface) ||
    !IMPROVEMENT_FEEDBACK_IMPACTS.includes(input.impact)
  )
    throw new ApplicationError('VALIDATION_ERROR', 'invalid improvement feedback');
}
export class RecordImprovementFeedback {
  constructor(private readonly repository: ImprovementFeedbackRepository) {}
  execute(input: ImprovementFeedbackInput): Promise<ImprovementFeedbackReceipt> {
    validateImprovementFeedback(input);
    return this.repository.record(input);
  }
}
