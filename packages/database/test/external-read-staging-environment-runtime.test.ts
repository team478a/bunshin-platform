import type { PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { PrismaExternalReadGrantRepository } from '../src/external-read-grants';

describe('external read staging environment runtime', () => {
  it('constructs the grant repository for the supported staging environment', () => {
    expect(
      () => new PrismaExternalReadGrantRepository({} as PrismaClient, 'staging'),
    ).not.toThrow();
  });
});
