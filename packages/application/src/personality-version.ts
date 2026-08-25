import type { FacePolicy } from '@bunshin/platform-domain';
import { ApplicationError } from '@bunshin/shared';

export const PERSONALITY_VERSION_SOURCES = ['INITIAL', 'MANUAL', 'LEARNING', 'RESTORE'] as const;
export type PersonalityVersionSource = (typeof PERSONALITY_VERSION_SOURCES)[number];

export interface PersonalityVersionContent {
  tone: string;
  formality: string;
  energyLevel: string;
  expertiseLevel: string;
  sentenceStyle: string;
  firstPerson: string;
  forbiddenExpressions: string[];
  preferredExpressions: string[];
  visualDirection: string | null;
  facePolicy: FacePolicy;
}

export interface BunshinPersonalityVersion extends PersonalityVersionContent {
  id: string;
  workspaceId: string;
  bunshinId: string;
  version: number;
  source: PersonalityVersionSource;
  changeReason: string;
  basedOnVersionId: string | null;
  createdByUserId: string;
  createdAt: Date;
}

export interface PersonalityVersionScope {
  workspaceId: string;
  bunshinId: string;
  actorUserId: string;
}

export interface PersonalityVersionRepository {
  create(
    input: PersonalityVersionScope & {
      content: PersonalityVersionContent;
      source: Exclude<PersonalityVersionSource, 'INITIAL' | 'RESTORE'>;
      changeReason: string;
      basedOnVersionId?: string | null;
    },
  ): Promise<BunshinPersonalityVersion | null>;
  restore(
    input: PersonalityVersionScope & { versionId: string; changeReason: string },
  ): Promise<BunshinPersonalityVersion | null>;
  list(input: PersonalityVersionScope): Promise<BunshinPersonalityVersion[] | null>;
}

const required = (value: string, field: string, maximum: number) => {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maximum)
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return normalized;
};

const stringList = (value: string[], field: string) => {
  if (value.length > 50) throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  const normalized = value.map((item) => required(item, field, 500));
  if (new Set(normalized).size !== normalized.length)
    throw new ApplicationError('VALIDATION_ERROR', `duplicate ${field}`);
  return normalized;
};

export function normalizePersonalityVersionContent(
  input: PersonalityVersionContent,
): PersonalityVersionContent {
  return {
    tone: required(input.tone, 'tone', 100),
    formality: required(input.formality, 'formality', 100),
    energyLevel: required(input.energyLevel, 'energyLevel', 100),
    expertiseLevel: required(input.expertiseLevel, 'expertiseLevel', 100),
    sentenceStyle: required(input.sentenceStyle, 'sentenceStyle', 500),
    firstPerson: required(input.firstPerson, 'firstPerson', 50),
    forbiddenExpressions: stringList(input.forbiddenExpressions, 'forbiddenExpressions'),
    preferredExpressions: stringList(input.preferredExpressions, 'preferredExpressions'),
    visualDirection:
      input.visualDirection === null
        ? null
        : required(input.visualDirection, 'visualDirection', 500),
    facePolicy: input.facePolicy,
  };
}

export class CreatePersonalityVersion {
  constructor(private readonly repository: PersonalityVersionRepository) {}

  async execute(
    input: PersonalityVersionScope & {
      content: PersonalityVersionContent;
      source: 'MANUAL' | 'LEARNING';
      changeReason: string;
      basedOnVersionId?: string | null;
    },
  ) {
    const value = await this.repository.create({
      ...input,
      content: normalizePersonalityVersionContent(input.content),
      changeReason: required(input.changeReason, 'changeReason', 500),
    });
    if (!value) throw new ApplicationError('NOT_FOUND', 'bunshin personality not found');
    return value;
  }
}

export class RestorePersonalityVersion {
  constructor(private readonly repository: PersonalityVersionRepository) {}

  async execute(input: PersonalityVersionScope & { versionId: string; changeReason: string }) {
    const value = await this.repository.restore({
      ...input,
      versionId: required(input.versionId, 'versionId', 100),
      changeReason: required(input.changeReason, 'changeReason', 500),
    });
    if (!value) throw new ApplicationError('NOT_FOUND', 'personality version not found');
    return value;
  }
}

export class ListPersonalityVersions {
  constructor(private readonly repository: PersonalityVersionRepository) {}

  async execute(input: PersonalityVersionScope) {
    const values = await this.repository.list(input);
    if (!values) throw new ApplicationError('NOT_FOUND', 'bunshin not found');
    return values;
  }
}
