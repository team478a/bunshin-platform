import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const http = readFileSync(new URL('../src/http/service-daily-actions.ts', import.meta.url), 'utf8');
const page = readFileSync(
  new URL('../app/s/[serviceSlug]/bunshins/[bunshinId]/page.tsx', import.meta.url),
  'utf8',
);
const ui = readFileSync(
  new URL('../app/s/[serviceSlug]/bunshins/[bunshinId]/daily-action-section.tsx', import.meta.url),
  'utf8',
);
const generation = readFileSync(
  new URL('../src/services/daily-mission-generation.ts', import.meta.url),
  'utf8',
);

describe('service Daily Action boundary', () => {
  it('derives owner, workspace, group and Bunshin scope on the server', () => {
    expect(http).toContain('resolvePublicServiceContext(serviceSlug)');
    expect(http).toContain('ownerUserId: actor.userId');
    expect(http).toContain('groupId: service.serviceId');
    expect(http).toContain("sourceId: { startsWith: 'daily-action:' }");
    expect(page).toContain('bunshin: { ownerUserId: actor.userId, groupId: service.serviceId }');
    expect(page).toContain('bunshin.ownerUserId === actor.userId');
  });

  it('offers six simple mobile actions and an extra question when material is missing', () => {
    expect(ui).toContain("type: 'PHOTO'");
    expect(ui).toContain("type: 'CUSTOMER_QUESTION'");
    expect(ui).toContain("type: 'VOICE_MEMO'");
    expect(ui).toContain("type: 'COMMENT_REPLY'");
    expect(ui).toContain("type: 'POST_IMPROVEMENT'");
    expect(ui).toContain("type: 'REST_REASON'");
    expect(ui).toContain('迷ったら、これを教えてください');
    expect(ui).toContain('iPhoneキーボード右下のマイク');
    expect(page).toContain('<DailyActionSection');
  });

  it('feeds only the current owner Bunshin materials into service generation', () => {
    expect(generation).toContain('allowServiceOwnerMemories');
    expect(generation).toContain('PrismaOwnerBunshinMemoryRepository');
    expect(generation).toContain("memory.sourceId?.startsWith('daily-action:')");
    expect(generation).toContain("type: 'PERSONAL_MATERIAL'");
  });
});
