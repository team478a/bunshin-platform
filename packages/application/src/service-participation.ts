import type { GroupMembership } from '@bunshin/platform-domain';
import { ApplicationError } from '@bunshin/shared';

export interface ServiceParticipationView {
  registrationMode: 'PUBLIC' | 'INVITATION_ONLY' | 'APPROVAL_REQUIRED' | 'CLOSED';
  membership: GroupMembership | null;
  legalDocuments: Array<{
    id: string;
    type: 'TERMS' | 'PRIVACY';
    version: number;
    title: string;
    content: string;
  }>;
}

export interface ServiceParticipationRepository {
  findView(input: {
    slug: string;
    actorUserId: string | null;
    now: Date;
  }): Promise<ServiceParticipationView | null>;
  request(input: {
    slug: string;
    actorUserId: string;
    legalDocumentIds: string[];
    now: Date;
  }): Promise<GroupMembership | null>;
  approve(input: {
    workspaceId: string;
    serviceId: string;
    groupMembershipId: string;
    actorUserId: string;
    reason: string;
    now: Date;
  }): Promise<GroupMembership | null>;
}

export class ServiceParticipationService {
  constructor(private readonly repository: ServiceParticipationRepository) {}

  async findView(input: { slug: string; actorUserId: string | null; now?: Date }) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug) || input.slug.length > 80)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid service slug');
    const result = await this.repository.findView({ ...input, now: input.now ?? new Date() });
    if (result === null) throw new ApplicationError('NOT_FOUND', 'service not found');
    return result;
  }

  async request(input: {
    slug: string;
    actorUserId: string;
    legalDocumentIds: string[];
    now?: Date;
  }) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug) || input.slug.length > 80)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid service slug');
    if (
      input.legalDocumentIds.length > 2 ||
      new Set(input.legalDocumentIds).size !== input.legalDocumentIds.length
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid service legal consents');
    const result = await this.repository.request({ ...input, now: input.now ?? new Date() });
    if (result === null)
      throw new ApplicationError('NOT_FOUND', 'service registration unavailable');
    return result;
  }

  async approve(input: {
    workspaceId: string;
    serviceId: string;
    groupMembershipId: string;
    actorUserId: string;
    reason: string;
    now?: Date;
  }) {
    const reason = input.reason.trim();
    if (reason.length < 5 || reason.length > 1000)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid approval reason');
    const result = await this.repository.approve({
      ...input,
      reason,
      now: input.now ?? new Date(),
    });
    if (result === null) throw new ApplicationError('FORBIDDEN', 'service approval denied');
    return result;
  }
}
