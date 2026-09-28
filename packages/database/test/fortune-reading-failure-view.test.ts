import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { fortuneReadingView } from '../src/fortune-shared';

describe('fortune failed result visibility', () => {
  it.each(['FAILED', 'READY_BASIC', 'READY_AI'] as const)(
    'does not expose incomplete content for %s while preserving complete results',
    async (status) => {
      const db = {
        fortuneCardMeaning: { findFirst: vi.fn().mockResolvedValue({ title: 'Approved title' }) },
        fortuneFeedback: { findUnique: vi.fn().mockResolvedValue(null) },
      } as unknown as PrismaClient;
      const result = await fortuneReadingView(db, {
        id: 'reading-a',
        localDate: new Date('2026-09-28T00:00:00Z'),
        theme: 'WORK',
        cardCode: 'THE_FOOL',
        orientation: 'UPRIGHT',
        status,
        readingText: 'Stored text',
        actionStep: 'Stored action',
        knowledgeVersionId: 'version-a',
        createdAt: new Date(),
      });
      expect(result).toMatchObject({
        status,
        title: status === 'FAILED' ? null : 'Approved title',
        body: status === 'FAILED' ? null : 'Stored text',
        actionStep: status === 'FAILED' ? null : 'Stored action',
      });
    },
  );
});
