import type { AiTrainingRuntimeRepository } from '@bunshin/capability-training';
import type { PrismaClient } from '@prisma/client';
import { PrismaAiTrainingRuntimeCandidateRepository } from './training-runtime-candidate-repository';
import { PrismaAiTrainingRuntimeDecisionRepository } from './training-runtime-decision-repository';
import { PrismaAiTrainingRuntimeStateRepository } from './training-runtime-state-repository';

export class PrismaAiTrainingRuntimeRepository implements AiTrainingRuntimeRepository {
  private readonly state: PrismaAiTrainingRuntimeStateRepository;
  private readonly candidates: PrismaAiTrainingRuntimeCandidateRepository;
  private readonly decisions: PrismaAiTrainingRuntimeDecisionRepository;

  constructor(client: PrismaClient) {
    this.state = new PrismaAiTrainingRuntimeStateRepository(client);
    this.candidates = new PrismaAiTrainingRuntimeCandidateRepository(client);
    this.decisions = new PrismaAiTrainingRuntimeDecisionRepository(client);
  }

  findState(input: Parameters<AiTrainingRuntimeRepository['findState']>[0]) {
    return this.state.findState(input);
  }

  findCandidate(input: Parameters<AiTrainingRuntimeRepository['findCandidate']>[0]) {
    return this.candidates.findCandidate(input);
  }

  persistDecision(input: Parameters<AiTrainingRuntimeRepository['persistDecision']>[0]) {
    return this.decisions.persistDecision(input);
  }
}
