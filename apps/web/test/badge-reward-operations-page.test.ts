import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../app/(app)/admin/badges/rewards/page.tsx', import.meta.url),
  'utf8',
);

describe('badge reward operations page boundaries', () => {
  it('requires super admin and preserves workspace scope for mutations', () => {
    expect(source).toContain("role: 'SUPER_ADMIN'");
    expect(source).toContain('workspaceId: parsed.data.workspaceId');
    expect(source).toContain('rewardLinkId: parsed.data.rewardLinkId');
  });

  it('requires reasons and explains exceptional manual operations', () => {
    expect(source).toContain('reason: z.string().trim().min(3).max(1000)');
    expect(source).toContain('通常は自動で付与されます');
    expect(source).toContain('重複付与はできません');
  });
});
