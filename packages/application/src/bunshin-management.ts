import type {
  BunshinAggregate,
  BunshinAudience,
  BunshinObjective,
  BunshinPersonality,
  BunshinType,
} from '@bunshin/platform-domain';
import { isValidBunshinSlug, normalizeBunshinSlug } from '@bunshin/platform-domain';
import { ApplicationError } from '@bunshin/shared';

import { requiredText } from './application-text-validation';

export interface CreateBunshinInput {
  workspaceId: string;
  groupId?: string | null;
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
  groupId?: string | null;
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
  groupId?: string | null;
  actorUserId: string;
  bunshinId: string;
}

export interface BunshinRepository {
  create(input: CreateBunshinInput & { slug: string }): Promise<BunshinAggregate>;
  list(input: { workspaceId: string; actorUserId: string }): Promise<BunshinAggregate[]>;
  listForService(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
  }): Promise<BunshinAggregate[]>;
  find(input: ScopedBunshinReference): Promise<BunshinAggregate | null>;
  update(input: UpdateBunshinInput): Promise<BunshinAggregate | null>;
  archive(input: ScopedBunshinReference): Promise<BunshinAggregate | null>;
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

export class ListServiceBunshins {
  constructor(private readonly repository: BunshinRepository) {}
  execute(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
  }): Promise<BunshinAggregate[]> {
    return this.repository.listForService(input);
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
