import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('service video delivery HTTP module boundary', () => {
  it('keeps the public module as a compatibility export surface', () => {
    const barrel = source('src/http/service-video-deliveries.ts');
    expect(barrel).toContain("from './service-video-delivery-admin';");
    expect(barrel).toContain("from './service-video-delivery-export';");
    expect(barrel).toContain("from './service-video-delivery-member';");
    expect(barrel).not.toContain('async function');
  });

  it('separates LINE notification, operator, member, and CSV responsibilities', () => {
    const notification = source('src/http/service-video-delivery-notification.ts');
    const admin = source('src/http/service-video-delivery-admin.ts');
    const member = source('src/http/service-video-delivery-member.ts');
    const csvExport = source('src/http/service-video-delivery-export.ts');
    expect(notification).toContain('videoDeliveryMessaging');
    expect(notification).not.toContain('RecordManualPost');
    expect(admin).toContain('AssignVideoDelivery');
    expect(admin).toContain('RevokeVideoDelivery');
    expect(member).toContain('RecordManualPost');
    expect(member).toContain('SupabaseVideoRenderOutputStorage');
    expect(csvExport).toContain('videoDelivery.findMany');
    expect(csvExport).not.toContain('sendDeliveryNotice');
  });

  it('keeps request IDs and API error mapping in one shared module', () => {
    const core = source('src/http/service-video-delivery-http-core.ts');
    expect(core).toContain('requestIdFromHeader');
    expect(core).toContain('toApiError');
    expect(core).toContain('serviceVideoDeliveryUuid');
  });
});
