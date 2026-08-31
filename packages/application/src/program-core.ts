import { ApplicationError } from '@bunshin/shared';

export const PROGRAM_SUPPORT_MODES = ['IDEA_ONLY', 'GUIDED', 'READY_TO_USE'] as const;
export type ProgramSupportMode = (typeof PROGRAM_SUPPORT_MODES)[number];

export type ProgramResponsibilityOwner = 'PLATFORM' | 'SERVICE';

export interface ProgramTemplateRecord {
  id: string;
  workspaceId: string;
  ownerGroupId: string | null;
  name: string;
  description: string;
  category: string;
  targetAudience: string;
  visibility: 'PLATFORM' | 'PRIVATE';
  status: 'DRAFT' | 'ACTIVE' | 'RETIRED';
}

export interface ProgramTemplateVersionRecord {
  id: string;
  workspaceId: string;
  programTemplateId: string;
  version: number;
  status: 'DRAFT' | 'PUBLISHED' | 'SUPERSEDED';
  definition: unknown;
  publishedAt: Date | null;
}

export interface ServiceProgramRecord {
  id: string;
  workspaceId: string;
  groupId: string;
  programTemplateVersionId: string;
  displayName: string;
  description: string;
  status: 'DRAFT' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  settings: unknown;
}

export interface ProgramOfferingRecord {
  id: string;
  workspaceId: string;
  groupId: string;
  serviceProgramId: string;
  version: number;
  status: 'DRAFT' | 'ACTIVE' | 'SUSPENDED' | 'SUPERSEDED';
  isFree: boolean;
  priceReference: string | null;
  responsibilities: {
    seller: ProgramResponsibilityOwner;
    priceOwner: ProgramResponsibilityOwner;
    paymentOwner: ProgramResponsibilityOwner;
    apiCostOwner: ProgramResponsibilityOwner;
    supportOwner: ProgramResponsibilityOwner;
    contentOwner: ProgramResponsibilityOwner;
    characterOwner: ProgramResponsibilityOwner;
  };
  termsSnapshot: unknown;
  startsAt: Date | null;
  endsAt: Date | null;
}

export interface ProgramEnrollmentRecord {
  id: string;
  workspaceId: string;
  groupId: string;
  groupMembershipId: string;
  serviceProgramId: string;
  programOfferingId: string;
  status: 'INVITED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';
  supportMode: ProgramSupportMode;
  goalSnapshot: unknown;
  offeringSnapshot: unknown;
  startsAt: Date | null;
  endsAt: Date | null;
}

export interface ProgramCoreRepository {
  createTemplate(input: {
    workspaceId: string;
    actorUserId: string;
    ownerGroupId: string | null;
    name: string;
    description: string;
    category: string;
    targetAudience: string;
    visibility: 'PLATFORM' | 'PRIVATE';
  }): Promise<ProgramTemplateRecord | null>;
  createTemplateVersion(input: {
    workspaceId: string;
    actorUserId: string;
    programTemplateId: string;
    definition: unknown;
    publish: boolean;
  }): Promise<ProgramTemplateVersionRecord | null>;
  adoptProgram(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    programTemplateVersionId: string;
    displayName: string;
    description: string;
    settings: unknown;
  }): Promise<ServiceProgramRecord | null>;
  createOffering(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    serviceProgramId: string;
    isFree: boolean;
    priceReference: string | null;
    responsibilities: ProgramOfferingRecord['responsibilities'];
    termsSnapshot: unknown;
    startsAt: Date | null;
    endsAt: Date | null;
  }): Promise<ProgramOfferingRecord | null>;
  enroll(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    groupMembershipId: string;
    serviceProgramId: string;
    programOfferingId: string;
    supportMode: ProgramSupportMode;
    goalSnapshot: unknown;
    startsAt: Date | null;
    endsAt: Date | null;
  }): Promise<ProgramEnrollmentRecord | null>;
  findEnrollment(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    groupMembershipId: string;
    serviceProgramId: string;
  }): Promise<ProgramEnrollmentRecord | null>;
}

const required = (value: string, field: string, max: number) => {
  const normalized = value.trim();
  if (!normalized || normalized.length > max)
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return normalized;
};

const period = (startsAt: Date | null, endsAt: Date | null) => {
  if (startsAt !== null && endsAt !== null && startsAt >= endsAt)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid program period');
};

export class ProgramCoreService {
  constructor(private readonly repository: ProgramCoreRepository) {}

  async createTemplate(input: Parameters<ProgramCoreRepository['createTemplate']>[0]) {
    if (
      (input.visibility === 'PLATFORM' && input.ownerGroupId !== null) ||
      (input.visibility === 'PRIVATE' && input.ownerGroupId === null)
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid template ownership');
    const result = await this.repository.createTemplate({
      ...input,
      name: required(input.name, 'name', 160),
      description: required(input.description, 'description', 2000),
      category: required(input.category, 'category', 80),
      targetAudience: required(input.targetAudience, 'targetAudience', 500),
    });
    if (result === null) throw new ApplicationError('FORBIDDEN', 'program template denied');
    return result;
  }

  async createTemplateVersion(
    input: Parameters<ProgramCoreRepository['createTemplateVersion']>[0],
  ) {
    const result = await this.repository.createTemplateVersion(input);
    if (result === null) throw new ApplicationError('FORBIDDEN', 'program version denied');
    return result;
  }

  async adoptProgram(input: Parameters<ProgramCoreRepository['adoptProgram']>[0]) {
    const result = await this.repository.adoptProgram({
      ...input,
      displayName: required(input.displayName, 'displayName', 160),
      description: required(input.description, 'description', 2000),
    });
    if (result === null) throw new ApplicationError('FORBIDDEN', 'program adoption denied');
    return result;
  }

  async createOffering(input: Parameters<ProgramCoreRepository['createOffering']>[0]) {
    period(input.startsAt, input.endsAt);
    if (input.isFree !== (input.priceReference === null))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid price reference');
    const result = await this.repository.createOffering(input);
    if (result === null) throw new ApplicationError('FORBIDDEN', 'program offering denied');
    return result;
  }

  async enroll(input: Parameters<ProgramCoreRepository['enroll']>[0]) {
    period(input.startsAt, input.endsAt);
    const result = await this.repository.enroll(input);
    if (result === null) throw new ApplicationError('FORBIDDEN', 'program enrollment denied');
    return result;
  }

  async findEnrollment(input: Parameters<ProgramCoreRepository['findEnrollment']>[0]) {
    const result = await this.repository.findEnrollment(input);
    if (result === null) throw new ApplicationError('NOT_FOUND', 'program enrollment not found');
    return result;
  }
}
