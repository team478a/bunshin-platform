import { ApplicationError } from '@bunshin/shared';

export const GENERATION_CONTEXT_SNAPSHOT_SCHEMA_VERSION = 1 as const;

export interface GenerationContextReference {
  id: string;
  version?: number;
}

export interface SelectedMemoryReference extends GenerationContextReference {
  summary: string;
  selectionReason: string;
}

export interface GenerationContextSnapshotPayload {
  personality: GenerationContextReference | null;
  selectedMemories: SelectedMemoryReference[];
  knowledge: GenerationContextReference[];
  groupKnowledge?: GenerationContextReference[];
  socialProfile: GenerationContextReference;
  strategy: GenerationContextReference;
  weeklyPlan: GenerationContextReference;
  contentPillar: GenerationContextReference;
  productPack: GenerationContextReference | null;
  campaign?: GenerationContextReference | null;
  classification?: 'ORGANIC' | 'PRODUCT_RELATED' | 'ADVERTISEMENT';
  trendCandidates: GenerationContextReference[];
  promptVersion: string;
  provider: string;
  model: string;
  quality: {
    verdict: 'PASS' | 'WARNING' | 'BLOCKED';
    issueCodes: string[];
    repairCount: number;
  };
  personalization?: {
    mode: 'AI' | 'FALLBACK';
    sourceTypes: string[];
    availableSourceTypes?: string[];
    onboardingResponse: GenerationContextReference | null;
    businessProfile: GenerationContextReference | null;
    weeklyPlanItem: GenerationContextReference;
    recentMissions: GenerationContextReference[];
    recentActivities: GenerationContextReference[];
    recentVariants: GenerationContextReference[];
    postRecords: GenerationContextReference[];
    socialInsights: GenerationContextReference[];
  };
}

export interface GenerationContextSnapshot {
  id: string;
  workspaceId: string;
  bunshinId: string;
  dailyMissionId: string;
  schemaVersion: typeof GENERATION_CONTEXT_SNAPSHOT_SCHEMA_VERSION;
  payload: GenerationContextSnapshotPayload;
  generatedAt: Date;
  createdAt: Date;
}

export interface GenerationContextSnapshotScope {
  workspaceId: string;
  bunshinId: string;
  actorUserId: string;
}

export interface GenerationContextSnapshotRepository {
  create(
    input: GenerationContextSnapshotScope & {
      dailyMissionId: string;
      schemaVersion: typeof GENERATION_CONTEXT_SNAPSHOT_SCHEMA_VERSION;
      payload: GenerationContextSnapshotPayload;
      generatedAt: Date;
    },
  ): Promise<GenerationContextSnapshot | null>;
  find(
    input: GenerationContextSnapshotScope & { dailyMissionId: string },
  ): Promise<GenerationContextSnapshot | null>;
}

function requireText(value: string, field: string) {
  if (value.trim().length === 0) {
    throw new ApplicationError('VALIDATION_ERROR', `${field} is required`);
  }
}

function requireUniqueReferences(values: GenerationContextReference[], field: string) {
  const ids = values.map(({ id }) => id);
  if (ids.some((id) => id.trim().length === 0) || new Set(ids).size !== ids.length) {
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  }
}

export function validateGenerationContextSnapshot(payload: GenerationContextSnapshotPayload) {
  requireText(payload.socialProfile.id, 'socialProfile.id');
  requireText(payload.strategy.id, 'strategy.id');
  requireText(payload.weeklyPlan.id, 'weeklyPlan.id');
  requireText(payload.contentPillar.id, 'contentPillar.id');
  requireText(payload.promptVersion, 'promptVersion');
  requireText(payload.provider, 'provider');
  requireText(payload.model, 'model');
  requireUniqueReferences(payload.selectedMemories, 'selectedMemories');
  requireUniqueReferences(payload.knowledge, 'knowledge');
  requireUniqueReferences(payload.groupKnowledge ?? [], 'groupKnowledge');
  requireUniqueReferences(payload.trendCandidates, 'trendCandidates');
  if (payload.personalization) {
    requireText(payload.personalization.weeklyPlanItem.id, 'personalization.weeklyPlanItem.id');
    requireUniqueReferences(
      payload.personalization.recentMissions,
      'personalization.recentMissions',
    );
    requireUniqueReferences(
      payload.personalization.recentActivities,
      'personalization.recentActivities',
    );
    requireUniqueReferences(
      payload.personalization.recentVariants,
      'personalization.recentVariants',
    );
    requireUniqueReferences(payload.personalization.postRecords, 'personalization.postRecords');
    requireUniqueReferences(
      payload.personalization.socialInsights,
      'personalization.socialInsights',
    );
    if (
      payload.personalization.sourceTypes.length === 0 ||
      new Set(payload.personalization.sourceTypes).size !==
        payload.personalization.sourceTypes.length
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid personalization.sourceTypes');
    if (
      payload.personalization.availableSourceTypes !== undefined &&
      (payload.personalization.availableSourceTypes.length === 0 ||
        new Set(payload.personalization.availableSourceTypes).size !==
          payload.personalization.availableSourceTypes.length ||
        payload.personalization.sourceTypes.some(
          (type) => !payload.personalization!.availableSourceTypes!.includes(type),
        ))
    )
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'invalid personalization.availableSourceTypes',
      );
  }
  for (const memory of payload.selectedMemories) {
    requireText(memory.summary, 'selectedMemory.summary');
    requireText(memory.selectionReason, 'selectedMemory.selectionReason');
  }
  if (payload.quality.repairCount < 0 || !Number.isInteger(payload.quality.repairCount)) {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid repairCount');
  }
  if (new Set(payload.quality.issueCodes).size !== payload.quality.issueCodes.length) {
    throw new ApplicationError('VALIDATION_ERROR', 'duplicate quality issue code');
  }
}

export class RecordGenerationContextSnapshot {
  constructor(private readonly repository: GenerationContextSnapshotRepository) {}

  async execute(
    input: GenerationContextSnapshotScope & {
      dailyMissionId: string;
      payload: GenerationContextSnapshotPayload;
      generatedAt?: Date;
    },
  ) {
    requireText(input.dailyMissionId, 'dailyMissionId');
    validateGenerationContextSnapshot(input.payload);
    const value = await this.repository.create({
      ...input,
      schemaVersion: GENERATION_CONTEXT_SNAPSHOT_SCHEMA_VERSION,
      generatedAt: input.generatedAt ?? new Date(),
    });
    if (value === null) throw new ApplicationError('NOT_FOUND', 'daily mission not found');
    return value;
  }
}

export class GetGenerationContextSnapshot {
  constructor(private readonly repository: GenerationContextSnapshotRepository) {}

  async execute(input: GenerationContextSnapshotScope & { dailyMissionId: string }) {
    requireText(input.dailyMissionId, 'dailyMissionId');
    const value = await this.repository.find(input);
    if (value === null) throw new ApplicationError('NOT_FOUND', 'generation context not found');
    return value;
  }
}
