import { describe, expect, it } from 'vitest';
import {
  ApprovePersonalityLearningProposal,
  CreatePersonalityLearningProposal,
  RejectPersonalityLearningProposal,
  RevokePersonalityLearningProposal,
  type BunshinPersonalityVersion,
  type PersonalityLearningProposal,
  type PersonalityLearningProposalRepository,
} from '../src';

const scope = { workspaceId: 'workspace-1', bunshinId: 'bunshin-1', actorUserId: 'user-1' };
const content = {
  tone: 'やさしい',
  formality: 'ふつう',
  energyLevel: '落ち着いている',
  expertiseLevel: '初心者にもわかる',
  sentenceStyle: '短い文',
  firstPerson: 'わたし',
  forbiddenExpressions: ['絶対に成功する'],
  preferredExpressions: ['一緒に試しましょう'],
  visualDirection: null,
  facePolicy: 'FULL_ANONYMOUS' as const,
};

class Proposals implements PersonalityLearningProposalRepository {
  values: PersonalityLearningProposal[] = [];
  version = 1;

  create(input: Parameters<PersonalityLearningProposalRepository['create']>[0]) {
    const value: PersonalityLearningProposal = {
      id: `proposal-${this.values.length + 1}`,
      workspaceId: input.workspaceId,
      bunshinId: input.bunshinId,
      status: 'PENDING',
      proposedContent: input.proposedContent,
      reason: input.reason,
      evidenceIds: input.evidenceIds,
      basedOnVersionId: input.basedOnVersionId,
      appliedVersionId: null,
      createdAt: new Date(),
      decidedAt: null,
      revokedAt: null,
    };
    this.values.push(value);
    return Promise.resolve(value);
  }

  list() {
    return Promise.resolve(this.values);
  }

  private personalityVersion(
    proposal: PersonalityLearningProposal,
    source: 'LEARNING' | 'RESTORE',
  ) {
    const value: BunshinPersonalityVersion = {
      id: `version-${++this.version}`,
      workspaceId: proposal.workspaceId,
      bunshinId: proposal.bunshinId,
      version: this.version,
      source,
      changeReason: proposal.reason,
      basedOnVersionId: proposal.basedOnVersionId,
      createdByUserId: scope.actorUserId,
      createdAt: new Date(),
      ...proposal.proposedContent,
    };
    return value;
  }

  approve(input: Parameters<PersonalityLearningProposalRepository['approve']>[0]) {
    const proposal = this.values.find(
      ({ id, status }) => id === input.proposalId && status === 'PENDING',
    );
    if (!proposal) return Promise.resolve(null);
    const personalityVersion = this.personalityVersion(proposal, 'LEARNING');
    Object.assign(proposal, {
      status: 'APPROVED',
      appliedVersionId: personalityVersion.id,
      decidedAt: new Date(),
    });
    return Promise.resolve({ proposal, personalityVersion });
  }

  reject(input: Parameters<PersonalityLearningProposalRepository['reject']>[0]) {
    const proposal = this.values.find(
      ({ id, status }) => id === input.proposalId && status === 'PENDING',
    );
    if (!proposal) return Promise.resolve(null);
    Object.assign(proposal, { status: 'REJECTED', decidedAt: new Date() });
    return Promise.resolve(proposal);
  }

  revoke(input: Parameters<PersonalityLearningProposalRepository['revoke']>[0]) {
    const proposal = this.values.find(
      ({ id, status }) => id === input.proposalId && status === 'APPROVED',
    );
    if (!proposal) return Promise.resolve(null);
    const personalityVersion = this.personalityVersion(proposal, 'RESTORE');
    Object.assign(proposal, { status: 'REVOKED', revokedAt: new Date() });
    return Promise.resolve({ proposal, personalityVersion });
  }
}

describe('Personality learning proposal', () => {
  it('requires at least three distinct evidence records', async () => {
    const repository = new Proposals();
    await expect(
      new CreatePersonalityLearningProposal(repository).execute({
        ...scope,
        proposedContent: content,
        reason: '文章を短くする',
        evidenceIds: ['feedback-1', 'feedback-2'],
        basedOnVersionId: 'version-1',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(repository.values).toHaveLength(0);
  });

  it('keeps a proposal pending until the owner approves it', async () => {
    const repository = new Proposals();
    const proposal = await new CreatePersonalityLearningProposal(repository).execute({
      ...scope,
      proposedContent: content,
      reason: ' 文章を短くする ',
      evidenceIds: ['feedback-1', 'feedback-2', 'feedback-3'],
      basedOnVersionId: 'version-1',
    });
    expect(proposal).toMatchObject({ status: 'PENDING', reason: '文章を短くする' });
    expect(proposal.appliedVersionId).toBeNull();

    const approved = await new ApprovePersonalityLearningProposal(repository).execute({
      ...scope,
      proposalId: proposal.id,
    });
    expect(approved.proposal.status).toBe('APPROVED');
    expect(approved.personalityVersion.source).toBe('LEARNING');
  });

  it('supports rejection and revocation without deleting audit history', async () => {
    const repository = new Proposals();
    const rejected = await repository.create({
      ...scope,
      proposedContent: content,
      reason: '却下候補',
      evidenceIds: ['a', 'b', 'c'],
      basedOnVersionId: 'version-1',
    });
    await new RejectPersonalityLearningProposal(repository).execute({
      ...scope,
      proposalId: rejected!.id,
    });
    expect(rejected!.status).toBe('REJECTED');

    const approved = await repository.create({
      ...scope,
      proposedContent: content,
      reason: '取消候補',
      evidenceIds: ['d', 'e', 'f'],
      basedOnVersionId: 'version-1',
    });
    await new ApprovePersonalityLearningProposal(repository).execute({
      ...scope,
      proposalId: approved!.id,
    });
    const revoked = await new RevokePersonalityLearningProposal(repository).execute({
      ...scope,
      proposalId: approved!.id,
    });
    expect(revoked.proposal.status).toBe('REVOKED');
    expect(revoked.personalityVersion.source).toBe('RESTORE');
    expect(repository.values).toHaveLength(2);
  });
});
