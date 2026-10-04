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

export interface GenerationDecisionMetadata {
  schemaVersion: 1;
  decisionEngineVersion: string;
  plannerPromptVersion: string;
  contextVersion: string;
  decisionStage: 'DAILY' | 'REVISED_BRIEF';
  status: 'READY';
  evidenceCompleteness: 'HIGH' | 'MEDIUM' | 'LOW';
  eligibleSignalTypes: string[];
  ignoredSignals: Array<{
    type: string;
    reason: 'OTHER_GOAL' | 'UNKNOWN_GOAL' | 'NO_OBSERVATION';
    count: number;
  }>;
  missingInputs: string[];
  limitations: string[];
  revision?: GenerationDecisionRevisionMetadata;
}

export interface GenerationDecisionRevisionMetadata {
  schemaVersion: 1;
  policyVersion: string;
  orchestrationPolicyVersion: string;
  attempt: 1;
  maximumAttempts: 1;
  revisionOfDecisionRef: string;
  decisionRef: string;
  trigger: {
    reason: 'QUALITY_REVISE' | 'CONTENT_INSPECTION_FAILED';
    qualityIssueCodes: string[];
    contentInspectionIssue:
      'INSTRUCTION_AS_POST' | 'EXACT_RECENT_CONTENT' | 'SUBSTANTIAL_RECENT_OVERLAP' | null;
  };
  initialPlannerModel: string;
  initialPlannerPromptVersion: string;
  rebriefModel: string;
  rebriefPlannerPromptVersion: string;
  finalQuality: {
    verdict: 'PASS';
    issueCodes: string[];
  };
}

export interface GenerationContextSnapshotPayload {
  personality: GenerationContextReference | null;
  selectedMemories: SelectedMemoryReference[];
  knowledge: GenerationContextReference[];
  groupKnowledge?: GenerationContextReference[];
  socialProfile: GenerationContextReference;
  strategy: GenerationContextReference & { goal?: string };
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
  decision?: GenerationDecisionMetadata;
  personalization?: {
    mode: 'AI' | 'FALLBACK';
    sourceTypes: string[];
    availableSourceTypes?: string[];
    reason?: string;
    onboardingResponse: GenerationContextReference | null;
    businessProfile: GenerationContextReference | null;
    weeklyPlanItem: GenerationContextReference;
    recentMissions: GenerationContextReference[];
    recentActivities: GenerationContextReference[];
    recentVariants: GenerationContextReference[];
    recentFeedback?: GenerationContextReference[];
    recentDecisions?: GenerationContextReference[];
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

function requireBoundedText(value: string, field: string, maximum: number) {
  requireText(value, field);
  if (value.length > maximum) throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
}

function requireUniqueText(values: string[], field: string, allowEmpty = false, maximum = 100) {
  if (
    (!allowEmpty && values.length === 0) ||
    values.length > maximum ||
    values.some((value) => value.trim().length === 0) ||
    values.some((value) => value.length > 200) ||
    new Set(values).size !== values.length
  )
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
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
  if (payload.strategy.goal !== undefined) requireText(payload.strategy.goal, 'strategy.goal');
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
    requireUniqueReferences(
      payload.personalization.recentFeedback ?? [],
      'personalization.recentFeedback',
    );
    requireUniqueReferences(
      payload.personalization.recentDecisions ?? [],
      'personalization.recentDecisions',
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
    if (payload.personalization.reason !== undefined) {
      requireBoundedText(payload.personalization.reason, 'personalization.reason', 500);
    }
  }
  if (payload.decision) {
    const decision = payload.decision;
    if (decision.schemaVersion !== 1)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid decision.schemaVersion');
    requireBoundedText(decision.decisionEngineVersion, 'decision.decisionEngineVersion', 200);
    requireBoundedText(decision.plannerPromptVersion, 'decision.plannerPromptVersion', 200);
    requireBoundedText(decision.contextVersion, 'decision.contextVersion', 200);
    if (
      !['DAILY', 'REVISED_BRIEF'].includes(decision.decisionStage) ||
      decision.status !== 'READY' ||
      !['HIGH', 'MEDIUM', 'LOW'].includes(decision.evidenceCompleteness)
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid decision state');
    requireUniqueText(decision.eligibleSignalTypes, 'decision.eligibleSignalTypes', false, 20);
    requireUniqueText(decision.missingInputs, 'decision.missingInputs', true, 20);
    requireUniqueText(decision.limitations, 'decision.limitations', true, 20);
    if (decision.ignoredSignals.length > 20)
      throw new ApplicationError('VALIDATION_ERROR', 'too many decision ignored signals');
    const ignoredKeys = decision.ignoredSignals.map(({ type, reason, count }) => {
      requireBoundedText(type, 'decision.ignoredSignals.type', 100);
      if (!['OTHER_GOAL', 'UNKNOWN_GOAL', 'NO_OBSERVATION'].includes(reason))
        throw new ApplicationError('VALIDATION_ERROR', 'invalid decision ignored reason');
      if (!Number.isInteger(count) || count < 1)
        throw new ApplicationError('VALIDATION_ERROR', 'invalid decision ignored count');
      return `${type}:${reason}`;
    });
    if (new Set(ignoredKeys).size !== ignoredKeys.length)
      throw new ApplicationError('VALIDATION_ERROR', 'duplicate decision ignored signal');
    if (decision.missingInputs.length > 0)
      throw new ApplicationError('VALIDATION_ERROR', 'ready decision has missing inputs');
    if (!payload.personalization?.reason)
      throw new ApplicationError('VALIDATION_ERROR', 'decision personalization reason is required');
    if (
      (decision.decisionStage === 'DAILY' && decision.revision !== undefined) ||
      (decision.decisionStage === 'REVISED_BRIEF' && decision.revision === undefined)
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid decision revision state');
    if (decision.revision) {
      const revision = decision.revision;
      if (
        revision.schemaVersion !== 1 ||
        revision.attempt !== 1 ||
        revision.maximumAttempts !== 1 ||
        revision.finalQuality.verdict !== 'PASS'
      )
        throw new ApplicationError('VALIDATION_ERROR', 'invalid decision revision');
      for (const [field, value] of [
        ['policyVersion', revision.policyVersion],
        ['orchestrationPolicyVersion', revision.orchestrationPolicyVersion],
        ['initialPlannerModel', revision.initialPlannerModel],
        ['initialPlannerPromptVersion', revision.initialPlannerPromptVersion],
        ['rebriefModel', revision.rebriefModel],
        ['rebriefPlannerPromptVersion', revision.rebriefPlannerPromptVersion],
      ] as const)
        requireBoundedText(value, `decision.revision.${field}`, 200);
      if (
        !/^sha256:[0-9a-f]{64}$/.test(revision.revisionOfDecisionRef) ||
        !/^sha256:[0-9a-f]{64}$/.test(revision.decisionRef)
      )
        throw new ApplicationError('VALIDATION_ERROR', 'invalid decision revision reference');
      if (!['QUALITY_REVISE', 'CONTENT_INSPECTION_FAILED'].includes(revision.trigger.reason))
        throw new ApplicationError('VALIDATION_ERROR', 'invalid decision revision trigger');
      if (
        revision.trigger.contentInspectionIssue !== null &&
        !['INSTRUCTION_AS_POST', 'EXACT_RECENT_CONTENT', 'SUBSTANTIAL_RECENT_OVERLAP'].includes(
          revision.trigger.contentInspectionIssue,
        )
      )
        throw new ApplicationError('VALIDATION_ERROR', 'invalid decision revision inspection');
      requireUniqueText(
        revision.trigger.qualityIssueCodes,
        'decision.revision.trigger.qualityIssueCodes',
        true,
        20,
      );
      requireUniqueText(
        revision.finalQuality.issueCodes,
        'decision.revision.finalQuality.issueCodes',
        true,
        20,
      );
    }
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
