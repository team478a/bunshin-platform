import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('video duration database constraint', () => {
  it('allows the 25-second carousel format alongside existing video durations', () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        'prisma/migrations/20260911003500_allow_25_second_video/migration.sql',
      ),
      'utf8',
    );
    expect(migration).toContain('CHECK ("duration_seconds" IN (25, 30, 60))');
  });
});
