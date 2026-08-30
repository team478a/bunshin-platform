import type { ServiceRole } from '@bunshin/platform-domain';
import { ApplicationError } from '@bunshin/shared';

export interface ServiceStaffRoleRecord {
  membershipId: string;
  workspaceId: string;
  groupId: string;
  userId: string;
  serviceRole: ServiceRole;
  status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
}

export interface ServiceStaffRoleRepository {
  list(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
  }): Promise<ServiceStaffRoleRecord[] | null>;
  set(input: {
    workspaceId: string;
    groupId: string;
    membershipId: string;
    serviceRole: ServiceRole;
    actorUserId: string;
    reason: string;
    now: Date;
  }): Promise<ServiceStaffRoleRecord | null>;
}

const reason = (value: string) => {
  const normalized = value.trim();
  if (normalized.length < 5 || normalized.length > 1000)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid reason');
  return normalized;
};

export class ServiceStaffRoleService {
  constructor(private readonly repository: ServiceStaffRoleRepository) {}

  async list(input: Parameters<ServiceStaffRoleRepository['list']>[0]) {
    const result = await this.repository.list(input);
    if (result === null) throw new ApplicationError('FORBIDDEN', 'service role management denied');
    return result;
  }

  async set(
    input: Omit<Parameters<ServiceStaffRoleRepository['set']>[0], 'reason' | 'now'> & {
      reason: string;
      now?: Date;
    },
  ) {
    const result = await this.repository.set({
      ...input,
      reason: reason(input.reason),
      now: input.now ?? new Date(),
    });
    if (result === null) throw new ApplicationError('FORBIDDEN', 'service role management denied');
    return result;
  }
}
