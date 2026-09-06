import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('member product content UI boundary', () => {
  const form = source('app/s/[serviceSlug]/tracking-link/member-product-content-form.tsx');

  it('uses only operator-approved active member URLs', () => {
    expect(form).toContain("link.status === 'ACTIVE'");
    expect(form).toContain('externalTrackingLinkId: linkId');
    expect(form).not.toContain("status === 'DRAFT'");
  });

  it('requires explicit generation and manual posting', () => {
    expect(form).toContain('商品情報を保存してAIで3案作る');
    expect(form).toContain('自動投稿はしません');
    expect(form).not.toContain('/api/daily-missions');
  });

  it('lets the member select a Bunshin and edit one of three drafts', () => {
    expect(form).toContain('投稿文に使う分身');
    expect(form).toContain('member-products/suggestions');
    expect(form).toContain('suggestionPayload.data.candidates');
    expect(form).toContain('setCandidates');
    expect(form).toContain('type="radio"');
  });

  it('warns users to confirm changing product facts', () => {
    expect(form).toContain('価格・効果・在庫などは自動取得しません');
    expect(form).toContain('PR表記');
  });

  it('saves and reloads products inside the current service route', () => {
    const page = source('app/s/[serviceSlug]/tracking-link/page.tsx');
    const http = source('src/http/member-product-profiles.ts');
    expect(form).toContain('/member-products');
    expect(form).toContain('保存した商品');
    expect(page).toContain('MemberProductProfileService');
    expect(http).toContain('actorUserId: actor.userId');
    expect(http).toContain('service.serviceId');
    expect(http).not.toContain('groupMembershipId:');
  });

  it('loads AI inputs again inside the authenticated server boundary', () => {
    const http = source('src/http/member-product-suggestions.ts');
    expect(http).toContain('requireSameOrigin(request)');
    expect(http).toContain('new GetBunshin');
    expect(http).toContain('MemberProductProfileService');
    expect(http).toContain("item.status === 'ACTIVE'");
    expect(http).toContain('resolveOpenAiRuntimeConfiguration()');
    expect(http).toContain('withOrganizationAiGenerationQuota');
    expect(http).toContain("taskType: 'MEMBER_PRODUCT_COPY_GENERATOR'");
    expect(http).not.toContain('process.env.OPENAI_API_KEY');
  });
});
