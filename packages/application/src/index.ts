import type {
  BunshinCapabilityAssignment,
  CapabilityAssignmentStatus,
  CapabilityType,
} from '@bunshin/capability-contract';
export type { BunshinCapabilityAssignment } from '@bunshin/capability-contract';
import type {
  AuthProviderType,
  BunshinAggregate,
  BunshinAudience,
  BunshinObjective,
  BunshinPersonality,
  BunshinType,
  PlatformAdmin,
  User,
  Workspace,
  WorkspaceMembership,
  OwnerKnowledge,
  OwnerKnowledgeType,
  BunshinKnowledgeGrant,
  BunshinMemory,
  BunshinMemoryType,
} from '@bunshin/platform-domain';
import { isValidBunshinSlug, normalizeBunshinSlug } from '@bunshin/platform-domain';
import { ApplicationError } from '@bunshin/shared';

export interface ValidationMetricsPeriod {
  from: Date;
  to: Date;
}

export interface ValidationFunnelCounts {
  registrations: number;
  bunshinCreations: number;
  socialActivations: number;
  strategyCompletions: number;
  strategyApprovals: number;
  firstMissionViews: number;
  missionAcceptances: number;
  copies: number;
  posts: number;
  d7ActiveUsers: number;
}

export interface ValidationMetricsSnapshot {
  period: ValidationMetricsPeriod;
  funnel: ValidationFunnelCounts;
  outcomes: {
    postedUsers: number;
    postCount: number;
    feedbackCount: number;
    goodFeedbackCount: number;
    goodFeedbackRate: number | null;
    threePostsInFirstSevenDaysUsers: number;
    eligibleFirstSevenDayUsers: number;
    threePostsInFirstSevenDaysRate: number | null;
    d7EligibleUsers: number;
    d7ActiveRate: number | null;
    aiCalls: number;
    aiSuccessfulCalls: number;
    aiFailedCalls: number;
    aiInputTokens: number;
    aiOutputTokens: number;
    aiPricedCalls: number;
    aiEstimatedCostUsdMicros: number | null;
  };
}

export interface RecordAiUsageInput {
  workspaceId: string;
  bunshinId: string;
  actorUserId: string;
  taskType: string;
  provider: string;
  model: string;
  promptVersion: string;
  status: 'SUCCESS' | 'FAILED';
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  estimatedCostUsdMicros?: number | null;
  pricingVersion?: string | null;
  errorCode?: string | null;
  idempotencyKey: string;
  occurredAt?: Date;
}

export interface AiUsageEventRepository {
  record(input: RecordAiUsageInput): Promise<void>;
}

export class RecordAiUsage {
  constructor(private readonly repository: AiUsageEventRepository) {}

  async execute(input: RecordAiUsageInput) {
    const required = [
      input.taskType,
      input.provider,
      input.model,
      input.promptVersion,
      input.idempotencyKey,
    ];
    if (required.some((value) => value.trim().length === 0))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid AI usage event');
    if (
      input.latencyMs < 0 ||
      (input.inputTokens !== null && input.inputTokens < 0) ||
      (input.outputTokens !== null && input.outputTokens < 0) ||
      (input.estimatedCostUsdMicros !== undefined &&
        input.estimatedCostUsdMicros !== null &&
        input.estimatedCostUsdMicros < 0)
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid AI usage measurements');
    if (input.status === 'SUCCESS' && input.errorCode)
      throw new ApplicationError('VALIDATION_ERROR', 'successful AI usage cannot have errorCode');
    await this.repository.record(input);
  }
}

export interface ValidationMetricsRepository {
  summarize(input: {
    workspaceId: string;
    actorUserId: string;
    period: ValidationMetricsPeriod;
  }): Promise<ValidationMetricsSnapshot | null>;
}

export class GetValidationMetrics {
  constructor(private readonly repository: ValidationMetricsRepository) {}

  async execute(input: {
    workspaceId: string;
    actorUserId: string;
    from: Date;
    to: Date;
  }): Promise<ValidationMetricsSnapshot> {
    if (
      Number.isNaN(input.from.getTime()) ||
      Number.isNaN(input.to.getTime()) ||
      input.from >= input.to
    ) {
      throw new ApplicationError('VALIDATION_ERROR', 'invalid metrics period');
    }
    const maximumPeriodMs = 366 * 24 * 60 * 60 * 1000;
    if (input.to.getTime() - input.from.getTime() > maximumPeriodMs) {
      throw new ApplicationError('VALIDATION_ERROR', 'metrics period must not exceed 366 days');
    }
    const value = await this.repository.summarize({
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      period: { from: input.from, to: input.to },
    });
    if (value === null) throw new ApplicationError('NOT_FOUND', 'workspace not found');
    return value;
  }
}

export interface CreateUserInput {
  displayName: string;
  email?: string | null;
  identity?: { provider: AuthProviderType; providerUserId: string };
}

export interface CreatedPersonalAccount {
  user: User;
  workspace: Workspace;
  membership: WorkspaceMembership;
}

export interface AccountTransaction {
  createUser(input: CreateUserInput): Promise<User>;
  createAuthIdentity?(input: {
    userId: string;
    provider: AuthProviderType;
    providerUserId: string;
  }): Promise<void>;
  createPersonalWorkspace(input: { ownerUserId: string; name: string }): Promise<Workspace>;
  createOwnerMembership(input: {
    workspaceId: string;
    userId: string;
  }): Promise<WorkspaceMembership>;
}

export interface AccountUnitOfWork {
  transaction<T>(operation: (transaction: AccountTransaction) => Promise<T>): Promise<T>;
}

export class CreateUserWithPersonalWorkspace {
  constructor(private readonly unitOfWork: AccountUnitOfWork) {}

  execute(input: CreateUserInput): Promise<CreatedPersonalAccount> {
    const displayName = input.displayName.trim();
    if (displayName.length === 0 || displayName.length > 100) {
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'displayName must contain 1 to 100 characters',
      );
    }

    return this.unitOfWork.transaction(async (transaction) => {
      const user = await transaction.createUser({ ...input, displayName });
      if (input.identity !== undefined && transaction.createAuthIdentity !== undefined) {
        await transaction.createAuthIdentity({ userId: user.id, ...input.identity });
      }
      const workspace = await transaction.createPersonalWorkspace({
        ownerUserId: user.id,
        name: `${displayName}のワークスペース`,
      });
      const membership = await transaction.createOwnerMembership({
        workspaceId: workspace.id,
        userId: user.id,
      });
      return { user, workspace, membership };
    });
  }
}

export interface WorkspaceAccessRepository {
  findAccessibleWorkspace(input: {
    actorUserId: string;
    workspaceId: string;
  }): Promise<Workspace | null>;
  updateWorkspaceName(input: {
    actorUserId: string;
    workspaceId: string;
    name: string;
  }): Promise<Workspace | null>;
}

export async function requireAccessibleWorkspace(
  repository: WorkspaceAccessRepository,
  input: { actorUserId: string; workspaceId: string },
): Promise<Workspace> {
  const workspace = await repository.findAccessibleWorkspace(input);
  if (workspace === null) throw new ApplicationError('NOT_FOUND', 'workspace not found');
  return workspace;
}

export interface PlatformAdminRepository {
  findActivePlatformAdminByUserId(userId: string): Promise<PlatformAdmin | null>;
}

export const LEGAL_DOCUMENT_TYPES = ['TERMS', 'PRIVACY'] as const;
export type LegalDocumentType = (typeof LEGAL_DOCUMENT_TYPES)[number];
export type LegalDocumentStatus = 'DRAFT' | 'PUBLISHED' | 'RETIRED';
export interface LegalDocument {
  id: string;
  type: LegalDocumentType;
  version: number;
  title: string;
  content: string;
  status: LegalDocumentStatus;
  effectiveAt: Date | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
export interface LegalDocumentRepository {
  listForAdmin(actorUserId: string): Promise<LegalDocument[] | null>;
  createDraft(input: {
    actorUserId: string;
    type: LegalDocumentType;
    title: string;
    content: string;
  }): Promise<LegalDocument | null>;
  publish(input: {
    actorUserId: string;
    documentId: string;
    effectiveAt: Date;
  }): Promise<LegalDocument | null>;
  findPublished(type: LegalDocumentType): Promise<LegalDocument | null>;
}
export class ListLegalDocuments {
  constructor(private readonly repository: LegalDocumentRepository) {}
  async execute(actorUserId: string) {
    const values = await this.repository.listForAdmin(actorUserId);
    if (values === null) throw new ApplicationError('NOT_FOUND', 'admin page not found');
    return values;
  }
}
export class CreateLegalDocumentDraft {
  constructor(private readonly repository: LegalDocumentRepository) {}
  async execute(input: {
    actorUserId: string;
    type: LegalDocumentType;
    title: string;
    content: string;
  }) {
    const title = input.title.trim();
    const content = input.content.trim();
    if (!LEGAL_DOCUMENT_TYPES.includes(input.type) || title.length < 1 || title.length > 200)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid legal document title');
    if (content.length < 1 || content.length > 100_000)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid legal document content');
    const value = await this.repository.createDraft({ ...input, title, content });
    if (value === null) throw new ApplicationError('NOT_FOUND', 'admin page not found');
    return value;
  }
}
export class PublishLegalDocument {
  constructor(private readonly repository: LegalDocumentRepository) {}
  async execute(input: { actorUserId: string; documentId: string; effectiveAt: Date }) {
    if (Number.isNaN(input.effectiveAt.getTime()))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid effective date');
    const value = await this.repository.publish(input);
    if (value === null) throw new ApplicationError('NOT_FOUND', 'legal document not found');
    return value;
  }
}

export interface JobContext {
  workspaceId: string;
  bunshinId?: string;
  capabilityType?: CapabilityType;
  correlationId: string;
  requestedBy: string;
}

export interface EnqueueJobInput extends JobContext {
  jobType: string;
  idempotencyKey: string;
  scheduledAt?: Date;
}

export interface JobReference {
  id: string;
}
export interface JobDispatcher {
  enqueue(input: EnqueueJobInput): Promise<JobReference>;
}

export interface JobDefinition extends EnqueueJobInput {
  attempt: number;
  status: string;
}
export interface Job extends JobDefinition {
  id: string;
  startedAt?: Date;
  completedAt?: Date;
  errorCode?: string;
}
export interface JobFailure {
  errorCode: string;
}

export interface JobRepository {
  create(input: JobDefinition): Promise<Job>;
  claim(workerId: string): Promise<Job | null>;
  complete(jobId: string): Promise<void>;
  fail(jobId: string, failure: JobFailure): Promise<void>;
}

export interface CreateBunshinInput {
  workspaceId: string;
  actorUserId: string;
  ownerUserId?: string;
  name: string;
  slug: string;
  type: BunshinType;
  objectiveSummary: string;
  audienceSummary: string;
  personalitySummary: string;
  avatarUrl?: string | null;
  objectives?: Array<
    Omit<BunshinObjective, 'id' | 'bunshinId' | 'status' | 'createdAt' | 'updatedAt'>
  >;
  audiences?: Array<Omit<BunshinAudience, 'id' | 'bunshinId' | 'createdAt' | 'updatedAt'>>;
  personality?: Omit<BunshinPersonality, 'id' | 'bunshinId' | 'createdAt' | 'updatedAt'>;
}

export interface UpdateBunshinInput {
  workspaceId: string;
  actorUserId: string;
  bunshinId: string;
  name?: string;
  objectiveSummary?: string;
  audienceSummary?: string;
  personalitySummary?: string;
  avatarUrl?: string | null;
}

export interface ScopedBunshinReference {
  workspaceId: string;
  actorUserId: string;
  bunshinId: string;
}

export interface BunshinRepository {
  create(input: CreateBunshinInput & { slug: string }): Promise<BunshinAggregate>;
  list(input: { workspaceId: string; actorUserId: string }): Promise<BunshinAggregate[]>;
  find(input: ScopedBunshinReference): Promise<BunshinAggregate | null>;
  update(input: UpdateBunshinInput): Promise<BunshinAggregate | null>;
  archive(input: ScopedBunshinReference): Promise<BunshinAggregate | null>;
}

function requiredText(value: string, field: string, maximum: number): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maximum) {
    throw new ApplicationError(
      'VALIDATION_ERROR',
      `${field} must contain 1 to ${maximum} characters`,
    );
  }
  return normalized;
}

function validateStringList(value: string[], field: string): string[] {
  if (value.length > 50 || value.some((item) => item.trim().length === 0 || item.length > 500)) {
    throw new ApplicationError('VALIDATION_ERROR', `${field} contains invalid entries`);
  }
  return value.map((item) => item.trim());
}

function normalizeCreateBunshin(input: CreateBunshinInput): CreateBunshinInput & { slug: string } {
  const slug = normalizeBunshinSlug(input.slug);
  if (!isValidBunshinSlug(slug)) {
    throw new ApplicationError('VALIDATION_ERROR', 'slug format is invalid');
  }
  const objectives = input.objectives?.map((item) => {
    if (!Number.isInteger(item.priority) || item.priority < 1) {
      throw new ApplicationError('VALIDATION_ERROR', 'objective priority must be positive');
    }
    return {
      ...item,
      objectiveType: requiredText(item.objectiveType, 'objectiveType', 80),
      primaryGoal: requiredText(item.primaryGoal, 'primaryGoal', 500),
    };
  });
  if (
    objectives !== undefined &&
    new Set(objectives.map((item) => item.priority)).size !== objectives.length
  ) {
    throw new ApplicationError('VALIDATION_ERROR', 'objective priorities must be unique');
  }
  const audiences = input.audiences?.map((item) => ({
    ...item,
    label: requiredText(item.label, 'audience.label', 120),
    painPoints: validateStringList(item.painPoints, 'painPoints'),
    desires: validateStringList(item.desires, 'desires'),
    excludedAudience: validateStringList(item.excludedAudience, 'excludedAudience'),
  }));
  const personality =
    input.personality === undefined
      ? undefined
      : {
          ...input.personality,
          tone: requiredText(input.personality.tone, 'tone', 100),
          forbiddenExpressions: validateStringList(
            input.personality.forbiddenExpressions,
            'forbiddenExpressions',
          ),
          preferredExpressions: validateStringList(
            input.personality.preferredExpressions,
            'preferredExpressions',
          ),
        };
  return {
    ...input,
    slug,
    name: requiredText(input.name, 'name', 100),
    objectiveSummary: requiredText(input.objectiveSummary, 'objectiveSummary', 500),
    audienceSummary: requiredText(input.audienceSummary, 'audienceSummary', 500),
    personalitySummary: requiredText(input.personalitySummary, 'personalitySummary', 500),
    ...(objectives === undefined ? {} : { objectives }),
    ...(audiences === undefined ? {} : { audiences }),
    ...(personality === undefined ? {} : { personality }),
  };
}

export class CreateBunshin {
  constructor(private readonly repository: BunshinRepository) {}
  execute(input: CreateBunshinInput): Promise<BunshinAggregate> {
    return this.repository.create(normalizeCreateBunshin(input));
  }
}

export class ListBunshins {
  constructor(private readonly repository: BunshinRepository) {}
  execute(input: { workspaceId: string; actorUserId: string }): Promise<BunshinAggregate[]> {
    return this.repository.list(input);
  }
}

export class GetBunshin {
  constructor(private readonly repository: BunshinRepository) {}
  async execute(input: ScopedBunshinReference): Promise<BunshinAggregate> {
    const result = await this.repository.find(input);
    if (result === null) throw new ApplicationError('NOT_FOUND', 'bunshin not found');
    return result;
  }
}

export class UpdateBunshinProfile {
  constructor(private readonly repository: BunshinRepository) {}
  async execute(input: UpdateBunshinInput): Promise<BunshinAggregate> {
    const normalized: UpdateBunshinInput = {
      ...input,
      ...(input.name === undefined ? {} : { name: requiredText(input.name, 'name', 100) }),
      ...(input.objectiveSummary === undefined
        ? {}
        : { objectiveSummary: requiredText(input.objectiveSummary, 'objectiveSummary', 500) }),
      ...(input.audienceSummary === undefined
        ? {}
        : { audienceSummary: requiredText(input.audienceSummary, 'audienceSummary', 500) }),
      ...(input.personalitySummary === undefined
        ? {}
        : {
            personalitySummary: requiredText(input.personalitySummary, 'personalitySummary', 500),
          }),
    };
    const result = await this.repository.update(normalized);
    if (result === null) throw new ApplicationError('NOT_FOUND', 'bunshin not found');
    return result;
  }
}

export class ArchiveBunshin {
  constructor(private readonly repository: BunshinRepository) {}
  async execute(input: ScopedBunshinReference): Promise<BunshinAggregate> {
    const result = await this.repository.archive(input);
    if (result === null) throw new ApplicationError('NOT_FOUND', 'bunshin not found');
    return result;
  }
}

export interface OwnerKnowledgeRepository {
  create(input: {
    workspaceId: string;
    actorUserId: string;
    type: OwnerKnowledgeType;
    title: string;
    content: string;
  }): Promise<OwnerKnowledge>;
  listOwned(input: { workspaceId: string; actorUserId: string }): Promise<OwnerKnowledge[]>;
  findOwned(input: {
    workspaceId: string;
    actorUserId: string;
    knowledgeId: string;
  }): Promise<OwnerKnowledge | null>;
  updateOwned(input: {
    workspaceId: string;
    actorUserId: string;
    knowledgeId: string;
    title?: string;
    content?: string;
    type?: OwnerKnowledgeType;
  }): Promise<OwnerKnowledge | null>;
  archiveOwned(input: {
    workspaceId: string;
    actorUserId: string;
    knowledgeId: string;
  }): Promise<OwnerKnowledge | null>;
}

export interface KnowledgeGrantRepository {
  grant(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    knowledgeId: string;
  }): Promise<BunshinKnowledgeGrant | null>;
  revoke(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    knowledgeId: string;
  }): Promise<BunshinKnowledgeGrant | null>;
  listGrantedKnowledge(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
  }): Promise<OwnerKnowledge[]>;
}

const knowledgeText = (value: string, field: string, maximum: number) =>
  requiredText(value, field, maximum);
export class CreateOwnerKnowledge {
  constructor(private readonly repository: OwnerKnowledgeRepository) {}
  execute(input: {
    workspaceId: string;
    actorUserId: string;
    type: OwnerKnowledgeType;
    title: string;
    content: string;
  }) {
    return this.repository.create({
      ...input,
      title: knowledgeText(input.title, 'title', 160),
      content: knowledgeText(input.content, 'content', 20000),
    });
  }
}
export class ListOwnerKnowledge {
  constructor(private readonly repository: OwnerKnowledgeRepository) {}
  execute(input: { workspaceId: string; actorUserId: string }) {
    return this.repository.listOwned(input);
  }
}
export class GetOwnerKnowledge {
  constructor(private readonly repository: OwnerKnowledgeRepository) {}
  async execute(input: { workspaceId: string; actorUserId: string; knowledgeId: string }) {
    const value = await this.repository.findOwned(input);
    if (!value) throw new ApplicationError('NOT_FOUND', 'knowledge not found');
    return value;
  }
}
export class UpdateOwnerKnowledge {
  constructor(private readonly repository: OwnerKnowledgeRepository) {}
  async execute(input: {
    workspaceId: string;
    actorUserId: string;
    knowledgeId: string;
    title?: string;
    content?: string;
    type?: OwnerKnowledgeType;
  }) {
    const normalized = {
      ...input,
      ...(input.title === undefined ? {} : { title: knowledgeText(input.title, 'title', 160) }),
      ...(input.content === undefined
        ? {}
        : { content: knowledgeText(input.content, 'content', 20000) }),
    };
    const value = await this.repository.updateOwned(normalized);
    if (!value) throw new ApplicationError('NOT_FOUND', 'knowledge not found');
    return value;
  }
}
export class ArchiveOwnerKnowledge {
  constructor(private readonly repository: OwnerKnowledgeRepository) {}
  async execute(input: { workspaceId: string; actorUserId: string; knowledgeId: string }) {
    const value = await this.repository.archiveOwned(input);
    if (!value) throw new ApplicationError('NOT_FOUND', 'knowledge not found');
    return value;
  }
}
export class GrantKnowledgeToBunshin {
  constructor(private readonly repository: KnowledgeGrantRepository) {}
  async execute(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    knowledgeId: string;
  }) {
    const value = await this.repository.grant(input);
    if (!value) throw new ApplicationError('NOT_FOUND', 'knowledge grant target not found');
    return value;
  }
}
export class RevokeKnowledgeFromBunshin {
  constructor(private readonly repository: KnowledgeGrantRepository) {}
  async execute(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    knowledgeId: string;
  }) {
    const value = await this.repository.revoke(input);
    if (!value) throw new ApplicationError('NOT_FOUND', 'knowledge grant not found');
    return value;
  }
}
export class ListGrantedKnowledgeForBunshin {
  constructor(private readonly repository: KnowledgeGrantRepository) {}
  execute(input: { workspaceId: string; actorUserId: string; bunshinId: string }) {
    return this.repository.listGrantedKnowledge(input);
  }
}

export interface BunshinMemoryRepository {
  create(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    type: BunshinMemoryType;
    content: string;
    summary?: string | null;
    confidence: number;
    importance: number;
  }): Promise<BunshinMemory | null>;
  list(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    includeInactive?: boolean;
  }): Promise<BunshinMemory[]>;
  find(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    memoryId: string;
  }): Promise<BunshinMemory | null>;
  update(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    memoryId: string;
    type?: BunshinMemoryType;
    content?: string;
    summary?: string | null;
    confidence?: number;
    importance?: number;
  }): Promise<BunshinMemory | null>;
  setActive(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    memoryId: string;
    active: boolean;
  }): Promise<BunshinMemory | null>;
  softDelete(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    memoryId: string;
  }): Promise<BunshinMemory | null>;
}
function validateMemoryValues(input: {
  content: string;
  summary?: string | null;
  confidence: number;
  importance: number;
}) {
  if (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1)
    throw new ApplicationError('VALIDATION_ERROR', 'confidence must be between 0 and 1');
  if (!Number.isInteger(input.importance) || input.importance < 1 || input.importance > 5)
    throw new ApplicationError('VALIDATION_ERROR', 'importance must be between 1 and 5');
  return {
    content: requiredText(input.content, 'content', 20000),
    summary: input.summary == null ? null : requiredText(input.summary, 'summary', 1000),
    confidence: input.confidence,
    importance: input.importance,
  };
}
export class CreateBunshinMemory {
  constructor(private readonly repository: BunshinMemoryRepository) {}
  async execute(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    type: BunshinMemoryType;
    content: string;
    summary?: string | null;
    confidence: number;
    importance: number;
  }) {
    const value = await this.repository.create({ ...input, ...validateMemoryValues(input) });
    if (!value) throw new ApplicationError('NOT_FOUND', 'bunshin not found');
    return value;
  }
}
export class ListBunshinMemories {
  constructor(private readonly repository: BunshinMemoryRepository) {}
  execute(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    includeInactive?: boolean;
  }) {
    return this.repository.list(input);
  }
}
export class GetBunshinMemory {
  constructor(private readonly repository: BunshinMemoryRepository) {}
  async execute(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    memoryId: string;
  }) {
    const value = await this.repository.find(input);
    if (!value) throw new ApplicationError('NOT_FOUND', 'memory not found');
    return value;
  }
}
export class UpdateBunshinMemory {
  constructor(private readonly repository: BunshinMemoryRepository) {}
  async execute(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    memoryId: string;
    type?: BunshinMemoryType;
    content?: string;
    summary?: string | null;
    confidence?: number;
    importance?: number;
  }) {
    const normalized = {
      ...input,
      ...(input.content === undefined
        ? {}
        : { content: requiredText(input.content, 'content', 20000) }),
      ...(input.summary === undefined
        ? {}
        : {
            summary: input.summary === null ? null : requiredText(input.summary, 'summary', 1000),
          }),
    };
    if (
      input.confidence !== undefined &&
      (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1)
    )
      throw new ApplicationError('VALIDATION_ERROR', 'confidence must be between 0 and 1');
    if (
      input.importance !== undefined &&
      (!Number.isInteger(input.importance) || input.importance < 1 || input.importance > 5)
    )
      throw new ApplicationError('VALIDATION_ERROR', 'importance must be between 1 and 5');
    const value = await this.repository.update(normalized);
    if (!value) throw new ApplicationError('NOT_FOUND', 'memory not found');
    return value;
  }
}
export class SetBunshinMemoryActive {
  constructor(private readonly repository: BunshinMemoryRepository) {}
  async execute(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    memoryId: string;
    active: boolean;
  }) {
    const value = await this.repository.setActive(input);
    if (!value) throw new ApplicationError('NOT_FOUND', 'memory not found');
    return value;
  }
}
export class DeleteBunshinMemory {
  constructor(private readonly repository: BunshinMemoryRepository) {}
  async execute(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    memoryId: string;
  }) {
    const value = await this.repository.softDelete(input);
    if (!value) throw new ApplicationError('NOT_FOUND', 'memory not found');
    return value;
  }
}

export interface BunshinCapabilityAssignmentRepository {
  assign(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    capabilityType: CapabilityType;
  }): Promise<BunshinCapabilityAssignment | null>;
  list(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
  }): Promise<BunshinCapabilityAssignment[] | null>;
  find(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    capabilityType: CapabilityType;
  }): Promise<BunshinCapabilityAssignment | null>;
  setStatus(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    capabilityType: CapabilityType;
    status: Extract<CapabilityAssignmentStatus, 'ACTIVE' | 'SUSPENDED'>;
  }): Promise<BunshinCapabilityAssignment | null>;
}

export class AssignCapabilityToBunshin {
  constructor(private readonly repository: BunshinCapabilityAssignmentRepository) {}
  async execute(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    capabilityType: CapabilityType;
  }) {
    const value = await this.repository.assign(input);
    if (value === null) throw new ApplicationError('NOT_FOUND', 'bunshin not found');
    return value;
  }
}

export class ListBunshinCapabilityAssignments {
  constructor(private readonly repository: BunshinCapabilityAssignmentRepository) {}
  async execute(input: { workspaceId: string; actorUserId: string; bunshinId: string }) {
    const values = await this.repository.list(input);
    if (values === null) throw new ApplicationError('NOT_FOUND', 'bunshin not found');
    return values;
  }
}

export class ActivateBunshinCapability {
  constructor(private readonly repository: BunshinCapabilityAssignmentRepository) {}
  async execute(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    capabilityType: CapabilityType;
  }) {
    const value = await this.repository.setStatus({ ...input, status: 'ACTIVE' });
    if (value === null) throw new ApplicationError('NOT_FOUND', 'capability assignment not found');
    return value;
  }
}

export class SuspendBunshinCapability {
  constructor(private readonly repository: BunshinCapabilityAssignmentRepository) {}
  async execute(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    capabilityType: CapabilityType;
  }) {
    const value = await this.repository.setStatus({ ...input, status: 'SUSPENDED' });
    if (value === null) throw new ApplicationError('NOT_FOUND', 'capability assignment not found');
    return value;
  }
}

export class RequireActiveBunshinCapability {
  constructor(private readonly repository: BunshinCapabilityAssignmentRepository) {}
  async execute(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
    capabilityType: CapabilityType;
  }) {
    const value = await this.repository.find(input);
    if (value === null) throw new ApplicationError('NOT_FOUND', 'capability assignment not found');
    if (value.status !== 'ACTIVE') {
      throw new ApplicationError('FORBIDDEN', 'capability is not active');
    }
    return value;
  }
}
