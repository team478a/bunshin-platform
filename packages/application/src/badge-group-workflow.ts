import { ApplicationError } from '@bunshin/shared';

export type BadgeApprovalDecision = 'APPROVED' | 'REJECTED';
export type BadgeCandidateDecision = 'APPROVED' | 'REJECTED';

export interface BadgeGroupWorkflowRepository {
  createAndSubmit(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    code: string;
    category: string;
    title: string;
    description: string;
    imageKey: string;
    altText: string;
    reason: string;
  }): Promise<{ definitionId: string; badgeVersionId: string; approvalRequestId: string } | null>;
  submit(input: {
    workspaceId: string;
    groupId: string;
    badgeVersionId: string;
    actorUserId: string;
    reason: string;
  }): Promise<{ id: string; status: 'PENDING' } | null>;
  review(input: {
    approvalRequestId: string;
    actorUserId: string;
    decision: BadgeApprovalDecision;
    reason: string;
    now: Date;
  }): Promise<{ id: string; status: BadgeApprovalDecision } | null>;
  nominate(input: {
    workspaceId: string;
    groupId: string;
    badgeVersionId: string;
    userId: string;
    actorUserId: string;
    reason: string;
  }): Promise<{ id: string; status: 'PENDING' } | null>;
  reviewCandidate(input: {
    candidateId: string;
    actorUserId: string;
    decision: BadgeCandidateDecision;
    reason: string;
    now: Date;
  }): Promise<{ id: string; status: BadgeCandidateDecision; awardId: string | null } | null>;
}

const required = (value: string, field: string, max = 1000) => {
  const normalized = value.trim();
  if (!normalized || normalized.length > max)
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return normalized;
};

export class SubmitGroupBadge {
  constructor(private readonly repository: BadgeGroupWorkflowRepository) {}
  async execute(input: Parameters<BadgeGroupWorkflowRepository['submit']>[0]) {
    const result = await this.repository.submit({
      ...input,
      reason: required(input.reason, 'reason'),
    });
    if (!result) throw new ApplicationError('FORBIDDEN', 'badge submission is not allowed');
    return result;
  }
}

export class CreateAndSubmitGroupBadge {
  constructor(private readonly repository: BadgeGroupWorkflowRepository) {}
  async execute(input: Parameters<BadgeGroupWorkflowRepository['createAndSubmit']>[0]) {
    const code = required(input.code, 'code', 100).toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9_-]*$/.test(code))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid badge code');
    const result = await this.repository.createAndSubmit({
      ...input,
      code,
      category: required(input.category, 'category', 80),
      title: required(input.title, 'title', 120),
      description: required(input.description, 'description', 500),
      imageKey: required(input.imageKey, 'image key', 255),
      altText: required(input.altText, 'alt text', 200),
      reason: required(input.reason, 'reason'),
    });
    if (!result) throw new ApplicationError('FORBIDDEN', 'badge creation is not allowed');
    return result;
  }
}

export class ReviewGroupBadge {
  constructor(private readonly repository: BadgeGroupWorkflowRepository) {}
  async execute(
    input: Omit<Parameters<BadgeGroupWorkflowRepository['review']>[0], 'now'> & { now?: Date },
  ) {
    const result = await this.repository.review({
      ...input,
      reason: required(input.reason, 'reason'),
      now: input.now ?? new Date(),
    });
    if (!result) throw new ApplicationError('FORBIDDEN', 'badge review is not allowed');
    return result;
  }
}

export class NominateGroupBadgeCandidate {
  constructor(private readonly repository: BadgeGroupWorkflowRepository) {}
  async execute(input: Parameters<BadgeGroupWorkflowRepository['nominate']>[0]) {
    const result = await this.repository.nominate({
      ...input,
      reason: required(input.reason, 'reason'),
    });
    if (!result) throw new ApplicationError('FORBIDDEN', 'badge nomination is not allowed');
    return result;
  }
}

export class ReviewGroupBadgeCandidate {
  constructor(private readonly repository: BadgeGroupWorkflowRepository) {}
  async execute(
    input: Omit<Parameters<BadgeGroupWorkflowRepository['reviewCandidate']>[0], 'now'> & {
      now?: Date;
    },
  ) {
    const result = await this.repository.reviewCandidate({
      ...input,
      reason: required(input.reason, 'reason'),
      now: input.now ?? new Date(),
    });
    if (!result) throw new ApplicationError('FORBIDDEN', 'badge candidate review is not allowed');
    return result;
  }
}
