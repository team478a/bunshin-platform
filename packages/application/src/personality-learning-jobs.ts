import { ApplicationError } from '@bunshin/shared';
import {
  CreatePersonalityLearningProposal,
  type PersonalityLearningProposal,
  type PersonalityLearningProposalRepository,
} from './personality-learning';
import type { PersonalityVersionContent } from './personality-version';

export interface PersonalityLearningEvidence {
  feedbackId: string;
  rating: 'BAD';
  missionFormat: string;
  occurredAt: Date;
}

export interface PersonalityLearningCandidate {
  workspaceId: string;
  bunshinId: string;
  actorUserId: string;
  basedOnVersionId: string;
  currentContent: PersonalityVersionContent;
  evidence: PersonalityLearningEvidence[];
}

export interface PersonalityLearningCandidateRepository {
  listEligible(input: { limit: number; evidenceLimit: number }): Promise<{
    candidates: PersonalityLearningCandidate[];
    truncated: boolean;
  }>;
}

export interface PersonalityLearningSuggestionPort {
  suggest(input: {
    currentContent: PersonalityVersionContent;
    evidence: Array<Pick<PersonalityLearningEvidence, 'rating' | 'missionFormat'>>;
  }): Promise<{ proposedContent: PersonalityVersionContent; reason: string }>;
}

export interface PersonalityLearningJobSummary {
  candidates: number;
  created: number;
  skipped: number;
  failures: number;
  truncated: boolean;
}

export class GeneratePersonalityLearningProposal {
  constructor(
    private readonly proposals: PersonalityLearningProposalRepository,
    private readonly suggestions: PersonalityLearningSuggestionPort,
  ) {}

  async execute(candidate: PersonalityLearningCandidate): Promise<PersonalityLearningProposal> {
    const evidenceIds = candidate.evidence.map(({ feedbackId }) => feedbackId);
    if (
      candidate.evidence.length < 3 ||
      new Set(evidenceIds).size !== evidenceIds.length ||
      candidate.evidence.some(({ rating }) => rating !== 'BAD')
    )
      throw new ApplicationError('VALIDATION_ERROR', 'insufficient repeated feedback');

    const suggestion = await this.suggestions.suggest({
      currentContent: candidate.currentContent,
      evidence: candidate.evidence.map(({ rating, missionFormat }) => ({ rating, missionFormat })),
    });
    return new CreatePersonalityLearningProposal(this.proposals).execute({
      workspaceId: candidate.workspaceId,
      bunshinId: candidate.bunshinId,
      actorUserId: candidate.actorUserId,
      basedOnVersionId: candidate.basedOnVersionId,
      evidenceIds,
      proposedContent: suggestion.proposedContent,
      reason: suggestion.reason,
    });
  }
}

export class RunPersonalityLearningProposalJob {
  constructor(
    private readonly candidates: PersonalityLearningCandidateRepository,
    private readonly generate: GeneratePersonalityLearningProposal,
    private readonly limit = 100,
  ) {}

  async execute(): Promise<PersonalityLearningJobSummary> {
    const result = await this.candidates.listEligible({ limit: this.limit, evidenceLimit: 20 });
    const summary: PersonalityLearningJobSummary = {
      candidates: result.candidates.length,
      created: 0,
      skipped: 0,
      failures: 0,
      truncated: result.truncated,
    };
    for (const candidate of result.candidates) {
      try {
        await this.generate.execute(candidate);
        summary.created += 1;
      } catch (error) {
        if (
          error instanceof ApplicationError &&
          ['CONFLICT', 'VALIDATION_ERROR'].includes(error.code)
        )
          summary.skipped += 1;
        else summary.failures += 1;
      }
    }
    return summary;
  }
}
