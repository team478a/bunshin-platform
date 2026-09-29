import { describe, expect, it } from 'vitest';
import { trainingEnrollmentDisplayStatus } from '../src/services/ai-training-enrollment-display';
const now = new Date('2026-09-29T01:00:00Z');
const past = new Date(now.getTime() - 1);
const future = new Date(now.getTime() + 1);
describe('training enrollment display projection', () => {
  it.each([
    { startsAt: now, endsAt: future, expected: 'ACTIVE' },
    { startsAt: past, endsAt: now, expected: 'PERIOD_ENDED' },
    { startsAt: past, endsAt: past, expected: 'PERIOD_ENDED' },
    { startsAt: future, endsAt: null, expected: 'BEFORE_START' },
    { startsAt: null, endsAt: null, expected: 'START_UNRESOLVED' },
    { startsAt: null, endsAt: now, expected: 'PERIOD_ENDED' },
    { startsAt: past, endsAt: null, expected: 'ACTIVE' },
  ])(
    'projects ACTIVE with $startsAt/$endsAt to $expected without changing input',
    ({ startsAt, endsAt, expected }) => {
      const row = Object.freeze({ status: 'ACTIVE' as const, startsAt, endsAt });
      expect(trainingEnrollmentDisplayStatus(row, now)).toBe(expected);
      expect(row.status).toBe('ACTIVE');
    },
  );
  it.each(['INVITED', 'COMPLETED', 'CANCELLED', 'EXPIRED'] as const)(
    'preserves %s regardless of planned period',
    (status) => {
      expect(trainingEnrollmentDisplayStatus({ status, startsAt: future, endsAt: past }, now)).toBe(
        status,
      );
    },
  );
});
