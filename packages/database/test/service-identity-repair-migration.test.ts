import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const officialRepair = readFileSync(
  fileURLToPath(
    new URL(
      '../prisma/migrations/20261025130000_repair_official_service_identity/migration.sql',
      import.meta.url,
    ),
  ),
  'utf8',
);

const manaberuCopyRepair = readFileSync(
  fileURLToPath(
    new URL(
      '../prisma/migrations/20261025131000_align_manaberu_public_registration_copy/migration.sql',
      import.meta.url,
    ),
  ),
  'utf8',
);

describe('service identity repair migrations', () => {
  it('repairs only the exact official service identity boundary', () => {
    expect(officialRepair).toContain('sc."id" = \'74000000-0000-4000-8000-000000000005\'::UUID');
    expect(officialRepair).toContain('sc."slug" = \'watashi-works-official\'');
    expect(officialRepair).toContain(
      'sc."group_id" = \'74000000-0000-4000-8000-000000000003\'::UUID',
    );
    expect(officialRepair).toContain("'ワタシワークス公式'");
    expect(officialRepair).toContain("'https://www.watashi-works.com/watashiworks-logo.jpg'");
    expect(officialRepair).toContain("'https://www.watashi-works.com/watashiworks-icon.jpg'");
    expect(officialRepair).toContain('service_configuration_audits');
    expect(officialRepair).not.toContain('UPDATE "service_registration_policies"');
    expect(officialRepair).not.toContain("'hassy'");
  });

  it('aligns Manaberu public copy without changing another service policy', () => {
    expect(manaberuCopyRepair).toContain('sc."slug" = \'manaberu-style\'');
    expect(manaberuCopyRepair).toContain(
      'sc."group_id" = \'ae9e96ca-16f3-4210-af4f-44d18bdaebe3\'::UUID',
    );
    expect(manaberuCopyRepair).toContain('現在は無料Pilotとして提供しています。');
    expect(manaberuCopyRepair).toContain('service_configuration_audits');
    expect(manaberuCopyRepair).not.toContain('service_registration_policies');
  });
});
