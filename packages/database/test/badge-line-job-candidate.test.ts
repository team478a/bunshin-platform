import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('badge LINE job candidates', () => {
  it('lists only due pending deliveries in the requested environment', () => {
    const source = readFileSync(
      new URL('../src/badge-line-notification.ts', import.meta.url),
      'utf8',
    );
    expect(source).toContain("status: 'PENDING'");
    expect(source).toContain('environment: input.environment');
    expect(source).toContain('scheduledAt: { lte: new Date() }');
  });
});
