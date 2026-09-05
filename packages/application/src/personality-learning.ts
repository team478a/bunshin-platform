import { ApplicationError } from '@bunshin/shared';
import {
  normalizePersonalityVersionContent,
  type BunshinPersonalityVersion,
  type PersonalityVersionContent,
  type PersonalityVersionScope,
} from './personality-version';

export const PERSONALITY_LEARNING_PROPOSAL_STATUSES = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'REVOKED',
] as const;

export type PersonalityLearningProposalStatus =
  (typeof PERSONALITY_LEARNING_PROPOSAL_STATUSES)[number];

export interface PersonalityLearningProposal {
  id: string;
  workspaceId: string;
  bunshinId: string;
  status: PersonalityLearningProposalStatus;
  proposedContent: PersonalityVersionContent;
  reason: string;
  evidenceIds: string[];
  basedOnVersionId: string;
  appliedVersionId: string | null;
  createdAt: Date;
  decidedAt: Date | null;
  revokedAt: Date | null;
}

export interface PersonalityLearningProposalRepository {
  create(
    input: PersonalityVersionScope & {
      proposedContent: PersonalityVersionContent;
      reason: string;
      evidenceIds: string[];
      basedOnVersionId: string;
    },
  ): Promise<PersonalityLearningProposal | null>;
  list(input: PersonalityVersionScope): Promise<PersonalityLearningProposal[] | null>;
  approve(input: PersonalityVersionScope & { proposalId: string }): Promise<{
    proposal: PersonalityLearningProposal;
    personalityVersion: BunshinPersonalityVersion;
  } | null>;
  reject(
    input: PersonalityVersionScope & { proposalId: string },
  ): Promise<PersonalityLearningProposal | null>;
  revoke(input: PersonalityVersionScope & { proposalId: string }): Promise<{
    proposal: PersonalityLearningProposal;
    personalityVersion: BunshinPersonalityVersion;
  } | null>;
}

const required = (value: string, field: string, maximum = 500) => {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum)
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return normalized;
};

const scopeWithProposal = (
  input: PersonalityVersionScope & { proposalId: string },
): PersonalityVersionScope & { proposalId: string } => ({
  ...input,
  proposalId: required(input.proposalId, 'proposalId', 100),
});

export class CreatePersonalityLearningProposal {
  constructor(private readonly repository: PersonalityLearningProposalRepository) {}

  async execute(
    input: PersonalityVersionScope & {
      proposedContent: PersonalityVersionContent;
      reason: string;
      evidenceIds: string[];
      basedOnVersionId: string;
    },
  ) {
    const evidenceIds = input.evidenceIds.map((id) => required(id, 'evidenceId', 100));
    if (evidenceIds.length < 3)
      throw new ApplicationError('VALIDATION_ERROR', 'insufficient learning evidence');
    if (new Set(evidenceIds).size !== evidenceIds.length)
      throw new ApplicationError('VALIDATION_ERROR', 'duplicate learning evidence');

    const value = await this.repository.create({
      ...input,
      proposedContent: normalizePersonalityVersionContent(input.proposedContent),
      reason: required(input.reason, 'reason'),
      evidenceIds,
      basedOnVersionId: required(input.basedOnVersionId, 'basedOnVersionId', 100),
    });
    if (!value) throw new ApplicationError('NOT_FOUND', 'bunshin personality not found');
    return value;
  }
}

export class ListPersonalityLearningProposals {
  constructor(private readonly repository: PersonalityLearningProposalRepository) {}

  async execute(input: PersonalityVersionScope) {
    const values = await this.repository.list(input);
    if (!values) throw new ApplicationError('NOT_FOUND', 'bunshin not found');
    return values;
  }
}

export class ApprovePersonalityLearningProposal {
  constructor(private readonly repository: PersonalityLearningProposalRepository) {}

  async execute(input: PersonalityVersionScope & { proposalId: string }) {
    const value = await this.repository.approve(scopeWithProposal(input));
    if (!value) throw new ApplicationError('NOT_FOUND', 'learning proposal not found');
    return value;
  }
}

export class RejectPersonalityLearningProposal {
  constructor(private readonly repository: PersonalityLearningProposalRepository) {}

  async execute(input: PersonalityVersionScope & { proposalId: string }) {
    const value = await this.repository.reject(scopeWithProposal(input));
    if (!value) throw new ApplicationError('NOT_FOUND', 'learning proposal not found');
    return value;
  }
}

export class RevokePersonalityLearningProposal {
  constructor(private readonly repository: PersonalityLearningProposalRepository) {}

  async execute(input: PersonalityVersionScope & { proposalId: string }) {
    const value = await this.repository.revoke(scopeWithProposal(input));
    if (!value) throw new ApplicationError('NOT_FOUND', 'learning proposal not found');
    return value;
  }
}
