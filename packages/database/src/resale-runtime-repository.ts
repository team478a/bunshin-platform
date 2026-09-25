import type { AiResaleRuntimeRepository } from '@bunshin/capability-resale';
import type { PrismaClient } from '@prisma/client';
import { PrismaAiResaleRuntimeCandidateRepository } from './resale-runtime-candidate-repository';
import { PrismaAiResaleRuntimeDecisionRepository } from './resale-runtime-decision-repository';
import { PrismaAiResaleRuntimeLifecycleRepository } from './resale-runtime-lifecycle-repository';

export class PrismaAiResaleRuntimeRepository implements AiResaleRuntimeRepository {
  private readonly lifecycle: PrismaAiResaleRuntimeLifecycleRepository;
  private readonly candidates: PrismaAiResaleRuntimeCandidateRepository;
  private readonly decisions: PrismaAiResaleRuntimeDecisionRepository;

  constructor(client: PrismaClient) {
    this.lifecycle = new PrismaAiResaleRuntimeLifecycleRepository(client);
    this.candidates = new PrismaAiResaleRuntimeCandidateRepository(client);
    this.decisions = new PrismaAiResaleRuntimeDecisionRepository(client);
  }

  expireEndedPaidParticipants(
    input: Parameters<AiResaleRuntimeRepository['expireEndedPaidParticipants']>[0],
  ) {
    return this.lifecycle.expireEndedPaidParticipants(input);
  }

  enrollEligibleFreeParticipants(
    input: Parameters<AiResaleRuntimeRepository['enrollEligibleFreeParticipants']>[0],
  ) {
    return this.lifecycle.enrollEligibleFreeParticipants(input);
  }

  listDueCandidates(input: Parameters<AiResaleRuntimeRepository['listDueCandidates']>[0]) {
    return this.candidates.listDueCandidates(input);
  }

  findCandidate(input: Parameters<AiResaleRuntimeRepository['findCandidate']>[0]) {
    return this.candidates.findCandidate(input);
  }

  persistDecision(input: Parameters<AiResaleRuntimeRepository['persistDecision']>[0]) {
    return this.decisions.persistDecision(input);
  }

  persistDaySevenClassification(
    input: Parameters<AiResaleRuntimeRepository['persistDaySevenClassification']>[0],
  ) {
    return this.decisions.persistDaySevenClassification(input);
  }
}
