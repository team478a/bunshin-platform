import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (file: string) => readFileSync(join(process.cwd(), 'src', file), 'utf8');

describe('fortune repository modules', () => {
  it('keeps the public repository as a compatibility facade', () => {
    const facade = source('fortune.ts');
    expect(facade).toContain('PrismaFortuneParticipantRepository');
    expect(facade).toContain('PrismaFortuneGenerationRepository');
    expect(facade).toContain('PrismaFortuneHistoryRepository');
    expect(facade).toContain('purgeExpiredFortuneReadings');
    expect(facade).not.toContain('$transaction');
  });

  it('separates participation, generation, and history persistence', () => {
    const participants = source('fortune-participant-repository.ts');
    const generation = source('fortune-generation-repository.ts');
    const history = source('fortune-history-repository.ts');
    expect(participants).toContain('async joinParticipant');
    expect(participants).not.toContain('async createBasicReading');
    expect(generation).toContain('async createBasicReading');
    expect(generation).toContain('async claimAiGeneration');
    expect(generation).not.toContain('async submitFeedback');
    expect(history).toContain('async submitFeedback');
    expect(history).toContain('async deleteReading');
  });

  it('centralizes service and participant isolation in the shared target resolver', () => {
    const shared = source('fortune-shared.ts');
    expect(shared).toContain('configuration: { slug: serviceSlug }');
    expect(shared).toContain("capabilityType: 'FORTUNE'");
    expect(shared).toContain('some: { userId: actorUserId');
    expect(shared).toContain("workspace: { status: 'ACTIVE' }");
  });
});
