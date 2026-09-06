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

  it('links a saved product only to a published service product master', () => {
    const page = source('app/s/[serviceSlug]/tracking-link/page.tsx');
    expect(form).toContain('公式商品情報（任意）');
    expect(form).toContain('productPackId: productPackId || null');
    expect(page).toContain('listProductMasters(scope)');
  });

  it('lets only the signed-in member archive a saved product', () => {
    const http = source('src/http/member-product-profiles.ts');
    const route = source('app/api/services/[serviceSlug]/member-products/[profileId]/route.ts');
    expect(form).toContain('この保存商品を非表示にする');
    expect(form).toContain("method: 'DELETE'");
    expect(route).toContain('archiveMemberProductProfileResponse');
    expect(http).toContain('actorUserId: actor.userId');
    expect(http).toContain('requireSameOrigin(request)');
  });

  it('loads AI inputs again inside the authenticated server boundary', () => {
    const http = source('src/http/member-product-suggestions.ts');
    expect(http).toContain('requireSameOrigin(request)');
    expect(http).toContain('new GetBunshin');
    expect(http).toContain('getGenerationContext');
    expect(http).toContain("item.status === 'ACTIVE'");
    expect(http).toContain('resolveOpenAiRuntimeConfiguration()');
    expect(http).toContain('withOrganizationAiGenerationQuota');
    expect(http).toContain("taskType: 'MEMBER_PRODUCT_COPY_GENERATOR'");
    expect(http).not.toContain('process.env.OPENAI_API_KEY');
  });

  it('uses official product facts and enforces official copy rules on the server', () => {
    const http = source('src/http/member-product-suggestions.ts');
    expect(http).toContain('officialProduct: profile.officialProduct');
    expect(http).toContain('requiredDisclosures: profile.officialProduct?.requiredDisclosures');
    expect(http).toContain('profile.officialProduct?.forbiddenExpressions');
    expect(http).toContain("'official product information unavailable'");
  });
});
