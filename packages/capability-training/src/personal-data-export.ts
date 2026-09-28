export type TrainingExportValue =
  | string
  | number
  | boolean
  | null
  | TrainingExportValue[]
  | { [key: string]: TrainingExportValue | undefined };

export type TrainingExportRecord = Record<string, TrainingExportValue>;

export interface TrainingPersonalDataSnapshot {
  enrollment: TrainingExportRecord;
  profile: TrainingExportRecord | null;
  progress: TrainingExportRecord | null;
  assignments: TrainingExportRecord[];
  answers: TrainingExportRecord[];
  toolkit: TrainingExportRecord[];
  activities: TrainingExportRecord[];
  goals: TrainingExportRecord[];
}

export interface TrainingPersonalDataScope {
  workspaceId: string;
  groupId: string;
  actorUserId: string;
  programEnrollmentId: string;
}

export const TRAINING_EXPORT_MAX_ROWS = 2000;
export const TRAINING_EXPORT_MAX_BYTES = 10 * 1024 * 1024;

export type TrainingPersonalDataReadResult =
  { outcome: 'FOUND'; data: TrainingPersonalDataSnapshot } | { outcome: 'NOT_FOUND' | 'TOO_LARGE' };

export interface TrainingPersonalDataExportRepository {
  read(input: TrainingPersonalDataScope): Promise<TrainingPersonalDataReadResult>;
}

export type TrainingPersonalDataExportResult =
  { outcome: 'EXPORTED'; json: string; filename: string } | { outcome: 'NOT_FOUND' | 'TOO_LARGE' };

export class ExportTrainingPersonalData {
  constructor(private readonly repository: TrainingPersonalDataExportRepository) {}

  async execute(
    input: TrainingPersonalDataScope & { now: Date },
  ): Promise<TrainingPersonalDataExportResult> {
    const result = await this.repository.read(input);
    if (result.outcome !== 'FOUND') return result;
    if (
      [
        result.data.assignments,
        result.data.answers,
        result.data.toolkit,
        result.data.activities,
        result.data.goals,
      ].some((rows) => rows.length > TRAINING_EXPORT_MAX_ROWS)
    ) {
      return { outcome: 'TOO_LARGE' };
    }
    // Reject large content before allocating an entire pretty-printed file.
    const encoder = new TextEncoder();
    let contentBytes = 0;
    const records = [
      result.data.enrollment,
      result.data.profile,
      result.data.progress,
      ...result.data.assignments,
      ...result.data.answers,
      ...result.data.toolkit,
      ...result.data.activities,
      ...result.data.goals,
    ];
    for (const record of records) {
      contentBytes += encoder.encode(JSON.stringify(record)).byteLength;
      if (contentBytes > TRAINING_EXPORT_MAX_BYTES) return { outcome: 'TOO_LARGE' };
    }
    const json = JSON.stringify(
      {
        format: 'BUNSHIN_AI_TRAINING_PERSONAL_DATA',
        schemaVersion: 1,
        exportedAt: input.now.toISOString(),
        ...result.data,
      },
      null,
      2,
    );
    if (encoder.encode(json).byteLength > TRAINING_EXPORT_MAX_BYTES)
      return { outcome: 'TOO_LARGE' };
    return {
      outcome: 'EXPORTED',
      json,
      filename: `ai-training-data-${input.now.toISOString().slice(0, 10)}.json`,
    };
  }
}
