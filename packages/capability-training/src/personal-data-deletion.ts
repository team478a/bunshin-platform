import type { TrainingPersonalDataScope } from './personal-data-export';

export type TrainingDataDeletionTarget = { kind: 'ALL' } | { kind: 'ANSWER'; answerId: string };
export interface TrainingDataDeletionCounts {
  answers: number;
  toolkit: number;
  profiles: number;
  progress: number;
  assignments: number;
  activities: number;
  goals: number;
  preferences: number;
}
export interface TrainingDataDeletionPreview {
  revision: string;
  counts: TrainingDataDeletionCounts;
  answers: { id: string; createdAt: string; evaluationStatus: string }[];
}
export type TrainingDataDeletionInput = TrainingPersonalDataScope & {
  target: TrainingDataDeletionTarget;
};
export type TrainingDataDeletionPreviewResult =
  | { outcome: 'PREVIEW'; preview: TrainingDataDeletionPreview }
  | { outcome: 'NOT_FOUND' | 'TOO_LARGE' };
export type TrainingDataDeletionResult =
  | { outcome: 'DELETED' | 'ALREADY_DELETED'; counts: TrainingDataDeletionCounts }
  | { outcome: 'NOT_FOUND' | 'TOO_LARGE' | 'CONFLICT' };
export interface TrainingPersonalDataDeletionRepository {
  preview(input: TrainingDataDeletionInput): Promise<TrainingDataDeletionPreviewResult>;
  delete(
    input: TrainingDataDeletionInput & { revision: string; now: Date },
  ): Promise<TrainingDataDeletionResult>;
}
export class DeleteTrainingPersonalData {
  constructor(private readonly repository: TrainingPersonalDataDeletionRepository) {}
  preview(input: TrainingDataDeletionInput) {
    return this.repository.preview(input);
  }
  execute(input: TrainingDataDeletionInput & { revision: string; now: Date }) {
    return this.repository.delete(input);
  }
}
