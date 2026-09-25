import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file: string) =>
  readFileSync(new URL(`../app/(app)/admin/images/${file}`, import.meta.url), 'utf8');

describe('image pilot admin module boundary', () => {
  it('keeps authorization and data orchestration visible in the page', () => {
    const page = read('page.tsx');

    expect(page).toContain('platformAdmin.findFirst');
    expect(page).toContain('if (!admin) notFound()');
    expect(page).toContain('<ImagePilotGroupSelector');
    expect(page).toContain('<ImagePilotStatus');
    expect(page).toContain('<ImagePilotSettingsForm');
    expect(page).not.toContain('<form className="form-stack"');
  });

  it('keeps privileged writes and eligibility checks in the server action', () => {
    const action = read('image-pilot-actions.ts');

    expect(action).toContain("'use server'");
    expect(action).toContain("role: 'SUPER_ADMIN'");
    expect(action).toContain("featureKey: 'SOCIAL.IMAGE_GENERATION'");
    expect(action).toContain("isolationLevel: 'Serializable'");
    expect(action).toContain('redirect(`/admin/images?groupId=${input.data.groupId}&saved=1`)');
  });
});
