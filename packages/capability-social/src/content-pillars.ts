import {
  RequireActiveBunshinCapability,
  type BunshinCapabilityAssignmentRepository,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
export interface ContentPillar {
  id: string;
  workspaceId: string;
  bunshinId: string;
  title: string;
  description: string | null;
  weight: number;
  active: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateContentPillarInput {
  workspaceId: string;
  groupId?: string | null;
  actorUserId: string;
  bunshinId: string;
  title: string;
  description?: string | null;
  weight: number;
}

export interface UpdateContentPillarInput {
  workspaceId: string;
  groupId?: string | null;
  actorUserId: string;
  bunshinId: string;
  pillarId: string;
  title?: string;
  description?: string | null;
  weight?: number;
}

export interface ContentPillarRepository {
  create(input: CreateContentPillarInput): Promise<ContentPillar | null>;
  list(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
  }): Promise<ContentPillar[] | null>;
  find(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
    pillarId: string;
  }): Promise<ContentPillar | null>;
  update(input: UpdateContentPillarInput): Promise<ContentPillar | null>;
  setActive(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
    pillarId: string;
    active: boolean;
  }): Promise<ContentPillar | null>;
  softDelete(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
    pillarId: string;
  }): Promise<ContentPillar | null>;
}

function pillarTitle(value: string) {
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > 100) {
    throw new ApplicationError('VALIDATION_ERROR', 'title must contain 1 to 100 characters');
  }
  return normalized;
}

function pillarDescription(value: string | null): string | null;
function pillarDescription(value: undefined): undefined;
function pillarDescription(value: string | null | undefined): string | null | undefined;
function pillarDescription(value: string | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null || value.trim().length === 0) return null;
  const normalized = value.trim();
  if (normalized.length > 500) {
    throw new ApplicationError('VALIDATION_ERROR', 'description exceeds 500 characters');
  }
  return normalized;
}

function pillarWeight(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new ApplicationError('VALIDATION_ERROR', 'weight must be an integer from 1 to 100');
  }
  return value;
}

export function normalizeCreateContentPillarInput(
  input: CreateContentPillarInput,
): CreateContentPillarInput {
  return {
    workspaceId: input.workspaceId,
    ...(input.groupId === undefined ? {} : { groupId: input.groupId }),
    actorUserId: input.actorUserId,
    bunshinId: input.bunshinId,
    title: pillarTitle(input.title),
    ...(input.description === undefined
      ? {}
      : { description: pillarDescription(input.description) }),
    weight: pillarWeight(input.weight),
  };
}

export function normalizeUpdateContentPillarInput(
  input: UpdateContentPillarInput,
): UpdateContentPillarInput {
  if (input.title === undefined && input.description === undefined && input.weight === undefined) {
    throw new ApplicationError('VALIDATION_ERROR', 'at least one update field is required');
  }
  return {
    workspaceId: input.workspaceId,
    ...(input.groupId === undefined ? {} : { groupId: input.groupId }),
    actorUserId: input.actorUserId,
    bunshinId: input.bunshinId,
    pillarId: input.pillarId,
    ...(input.title === undefined ? {} : { title: pillarTitle(input.title) }),
    ...(input.description === undefined
      ? {}
      : { description: pillarDescription(input.description) }),
    ...(input.weight === undefined ? {} : { weight: pillarWeight(input.weight) }),
  };
}

abstract class ContentPillarMutation {
  constructor(
    protected readonly pillars: ContentPillarRepository,
    private readonly assignments: BunshinCapabilityAssignmentRepository,
  ) {}
  protected async requireActive(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
  }) {
    await new RequireActiveBunshinCapability(this.assignments).execute({
      ...input,
      capabilityType: 'SOCIAL',
    });
  }
}

export class CreateContentPillar extends ContentPillarMutation {
  async execute(input: CreateContentPillarInput) {
    const normalized = normalizeCreateContentPillarInput(input);
    await this.requireActive(normalized);
    const value = await this.pillars.create(normalized);
    if (value === null) throw new ApplicationError('NOT_FOUND', 'bunshin not found');
    return value;
  }
}

export class ListContentPillars {
  constructor(private readonly pillars: ContentPillarRepository) {}
  async execute(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
  }) {
    const values = await this.pillars.list(input);
    if (values === null) throw new ApplicationError('NOT_FOUND', 'bunshin not found');
    return values;
  }
}

export class GetContentPillar {
  constructor(private readonly pillars: ContentPillarRepository) {}
  async execute(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
    pillarId: string;
  }) {
    const value = await this.pillars.find(input);
    if (value === null) throw new ApplicationError('NOT_FOUND', 'content pillar not found');
    return value;
  }
}

export class UpdateContentPillar extends ContentPillarMutation {
  async execute(input: UpdateContentPillarInput) {
    const normalized = normalizeUpdateContentPillarInput(input);
    await this.requireActive(normalized);
    const value = await this.pillars.update(normalized);
    if (value === null) throw new ApplicationError('NOT_FOUND', 'content pillar not found');
    return value;
  }
}

abstract class SetContentPillarActive extends ContentPillarMutation {
  constructor(
    pillars: ContentPillarRepository,
    assignments: BunshinCapabilityAssignmentRepository,
    private readonly active: boolean,
  ) {
    super(pillars, assignments);
  }
  async execute(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
    pillarId: string;
  }) {
    await this.requireActive(input);
    const value = await this.pillars.setActive({ ...input, active: this.active });
    if (value === null) throw new ApplicationError('NOT_FOUND', 'content pillar not found');
    return value;
  }
}

export class ActivateContentPillar extends SetContentPillarActive {
  constructor(p: ContentPillarRepository, a: BunshinCapabilityAssignmentRepository) {
    super(p, a, true);
  }
}
export class DeactivateContentPillar extends SetContentPillarActive {
  constructor(p: ContentPillarRepository, a: BunshinCapabilityAssignmentRepository) {
    super(p, a, false);
  }
}

export class DeleteContentPillar extends ContentPillarMutation {
  async execute(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
    pillarId: string;
  }) {
    await this.requireActive(input);
    const value = await this.pillars.softDelete(input);
    if (value === null) throw new ApplicationError('NOT_FOUND', 'content pillar not found');
    return value;
  }
}
