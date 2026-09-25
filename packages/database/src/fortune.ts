import type { FortuneRepository } from '@bunshin/capability-fortune';
import type { PrismaClient } from '@prisma/client';
import { PrismaFortuneGenerationRepository } from './fortune-generation-repository';
import { PrismaFortuneHistoryRepository } from './fortune-history-repository';
import { PrismaFortuneParticipantRepository } from './fortune-participant-repository';

export { fortuneReadingRetentionCutoff, purgeExpiredFortuneReadings } from './fortune-retention';

export class PrismaFortuneRepository implements FortuneRepository {
  private readonly participants: PrismaFortuneParticipantRepository;
  private readonly generation: PrismaFortuneGenerationRepository;
  private readonly history: PrismaFortuneHistoryRepository;

  constructor(db: PrismaClient, now: () => Date = () => new Date()) {
    this.participants = new PrismaFortuneParticipantRepository(db);
    this.generation = new PrismaFortuneGenerationRepository(db);
    this.history = new PrismaFortuneHistoryRepository(db, now);
  }

  joinParticipant(input: Parameters<FortuneRepository['joinParticipant']>[0]) {
    return this.participants.joinParticipant(input);
  }

  findParticipant(input: Parameters<FortuneRepository['findParticipant']>[0]) {
    return this.participants.findParticipant(input);
  }

  findReadingForDate(input: Parameters<FortuneRepository['findReadingForDate']>[0]) {
    return this.generation.findReadingForDate(input);
  }

  createBasicReading(input: Parameters<FortuneRepository['createBasicReading']>[0]) {
    return this.generation.createBasicReading(input);
  }

  claimAiGeneration(input: Parameters<FortuneRepository['claimAiGeneration']>[0]) {
    return this.generation.claimAiGeneration(input);
  }

  completeAiGeneration(input: Parameters<FortuneRepository['completeAiGeneration']>[0]) {
    return this.generation.completeAiGeneration(input);
  }

  fallbackAiGeneration(input: Parameters<FortuneRepository['fallbackAiGeneration']>[0]) {
    return this.generation.fallbackAiGeneration(input);
  }

  listReadings(input: Parameters<FortuneRepository['listReadings']>[0]) {
    return this.history.listReadings(input);
  }

  findReading(input: Parameters<FortuneRepository['findReading']>[0]) {
    return this.history.findReading(input);
  }

  markReadingViewed(input: Parameters<FortuneRepository['markReadingViewed']>[0]) {
    return this.history.markReadingViewed(input);
  }

  submitFeedback(input: Parameters<FortuneRepository['submitFeedback']>[0]) {
    return this.history.submitFeedback(input);
  }

  deleteReading(input: Parameters<FortuneRepository['deleteReading']>[0]) {
    return this.history.deleteReading(input);
  }
}
