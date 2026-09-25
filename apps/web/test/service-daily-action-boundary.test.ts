import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const http = readFileSync(new URL('../src/http/service-daily-actions.ts', import.meta.url), 'utf8');
const page = [
  'service-bunshin-detail-data.ts',
  'service-bunshin-detail-daily-actions.ts',
  'service-bunshin-detail-view.tsx',
]
  .map((file) =>
    readFileSync(
      new URL(`../app/s/[serviceSlug]/bunshins/[bunshinId]/${file}`, import.meta.url),
      'utf8',
    ),
  )
  .join('\n');
const ui = readFileSync(
  new URL('../app/s/[serviceSlug]/bunshins/[bunshinId]/daily-action-section.tsx', import.meta.url),
  'utf8',
);
const generation = readFileSync(
  new URL('../src/services/daily-mission-generation.ts', import.meta.url),
  'utf8',
);
const planningContext = readFileSync(
  new URL('../src/services/daily-mission-planning-context.ts', import.meta.url),
  'utf8',
);
const automaticImage = readFileSync(
  new URL('../src/services/automatic-daily-image.ts', import.meta.url),
  'utf8',
);

describe('service Daily Action boundary', () => {
  it('derives owner, workspace, group and Bunshin scope on the server', () => {
    expect(http).toContain('resolvePublicServiceContext(serviceSlug)');
    expect(http).toContain('ownerUserId: actor.userId');
    expect(http).toContain('groupId: service.serviceId');
    expect(http).toContain("sourceId: { startsWith: 'daily-action:' }");
    expect(page).toContain('bunshin: { ownerUserId: input.actorUserId, groupId: input.groupId }');
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

  it('lets iPhone users choose an existing photo instead of forcing the camera', () => {
    expect(ui).toContain('「写真ライブラリ」または「写真を撮る」');
    expect(ui).toContain('選択した写真：');
    expect(ui).not.toContain('capture="environment"');
  });

  it('feeds only the current owner Bunshin materials into service generation', () => {
    expect(generation).toContain('allowServiceOwnerMemories');
    expect(planningContext).toContain('PrismaOwnerBunshinMemoryRepository');
    expect(planningContext).toContain("memory.sourceId?.startsWith('daily-action:')");
    expect(planningContext).toContain("type: 'PERSONAL_MATERIAL'");
  });

  it('applies only the selected owned photo to automatic image generation', () => {
    expect(ui).toContain('毎日の画像に使う');
    expect(http).toContain('automaticImageReference: true');
    expect(automaticImage).toContain('automaticImageReference: true');
    expect(automaticImage).toContain('ownerUserId: input.actorUserId');
    expect(automaticImage).toContain('referenceImage: reference?.referenceImage ?? null');
    expect(automaticImage).toContain('storeReference');
  });
});
