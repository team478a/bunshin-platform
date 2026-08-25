import type { Group, GroupInvitation, GroupMembership, GroupRole } from '@bunshin/platform-domain';
import { ApplicationError } from '@bunshin/shared';

export interface GroupActorScope {
  workspaceId: string;
  actorUserId: string;
}

export interface GroupParticipationRepository {
  createGroup(input: GroupActorScope & { name: string }): Promise<Group | null>;
  createInvitation(
    input: GroupActorScope & {
      groupId: string;
      tokenHash: string;
      role: GroupRole;
      expiresAt: Date;
      maxUses: number;
    },
  ): Promise<GroupInvitation | null>;
  acceptInvitation(
    input: GroupActorScope & { tokenHash: string; now: Date },
  ): Promise<GroupMembership | null>;
  declineInvitation(
    input: GroupActorScope & { tokenHash: string; now: Date },
  ): Promise<GroupMembership | null>;
  leaveGroup(
    input: GroupActorScope & { groupId: string; now: Date },
  ): Promise<GroupMembership | null>;
  listMemberships(input: GroupActorScope): Promise<GroupMembership[] | null>;
}

const required = (value: string, field: string, maximum: number) => {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maximum)
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return normalized;
};

export class GroupParticipationService {
  constructor(private readonly repository: GroupParticipationRepository) {}

  async createGroup(input: GroupActorScope & { name: string }) {
    const result = await this.repository.createGroup({
      ...input,
      name: required(input.name, 'name', 120),
    });
    if (result === null) throw new ApplicationError('FORBIDDEN', 'group management denied');
    return result;
  }

  async createInvitation(
    input: GroupActorScope & {
      groupId: string;
      tokenHash: string;
      role?: GroupRole;
      expiresAt: Date;
      maxUses?: number;
    },
  ) {
    if (!/^[a-f0-9]{64}$/.test(input.tokenHash))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid tokenHash');
    if (input.expiresAt.getTime() <= Date.now())
      throw new ApplicationError('VALIDATION_ERROR', 'invalid expiresAt');
    const maxUses = input.maxUses ?? 1;
    if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 1000)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid maxUses');
    const result = await this.repository.createInvitation({
      ...input,
      role: input.role ?? 'PARTICIPANT',
      maxUses,
    });
    if (result === null) throw new ApplicationError('FORBIDDEN', 'invitation management denied');
    return result;
  }

  async acceptInvitation(input: GroupActorScope & { tokenHash: string; now?: Date }) {
    const result = await this.repository.acceptInvitation({
      ...input,
      now: input.now ?? new Date(),
    });
    if (result === null) throw new ApplicationError('NOT_FOUND', 'invitation unavailable');
    return result;
  }

  async declineInvitation(input: GroupActorScope & { tokenHash: string; now?: Date }) {
    const result = await this.repository.declineInvitation({
      ...input,
      now: input.now ?? new Date(),
    });
    if (result === null) throw new ApplicationError('NOT_FOUND', 'invitation unavailable');
    return result;
  }

  async leaveGroup(input: GroupActorScope & { groupId: string; now?: Date }) {
    const result = await this.repository.leaveGroup({ ...input, now: input.now ?? new Date() });
    if (result === null) throw new ApplicationError('NOT_FOUND', 'membership unavailable');
    return result;
  }

  async listMemberships(input: GroupActorScope) {
    const result = await this.repository.listMemberships(input);
    if (result === null) throw new ApplicationError('FORBIDDEN', 'workspace access denied');
    return result;
  }
}
