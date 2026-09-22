import type {
  BunshinCapabilityAssignment,
  CapabilityAssignmentStatus,
  CapabilityType,
} from '@bunshin/capability-contract';
import { ApplicationError } from '@bunshin/shared';

export interface BunshinCapabilityAssignmentRepository {
  assign(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
    capabilityType: CapabilityType;
  }): Promise<BunshinCapabilityAssignment | null>;
  list(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
  }): Promise<BunshinCapabilityAssignment[] | null>;
  find(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
    capabilityType: CapabilityType;
  }): Promise<BunshinCapabilityAssignment | null>;
  setStatus(input: {
    workspaceId: string;
    groupId?: string | null;
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
    groupId?: string | null;
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
  async execute(input: {
    workspaceId: string;
    groupId?: string | null;
    actorUserId: string;
    bunshinId: string;
  }) {
    const values = await this.repository.list(input);
    if (values === null) throw new ApplicationError('NOT_FOUND', 'bunshin not found');
    return values;
  }
}

export class ActivateBunshinCapability {
  constructor(private readonly repository: BunshinCapabilityAssignmentRepository) {}
  async execute(input: {
    workspaceId: string;
    groupId?: string | null;
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
    groupId?: string | null;
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
    groupId?: string | null;
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
