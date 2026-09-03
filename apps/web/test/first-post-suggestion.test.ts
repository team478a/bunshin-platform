import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('../src/auth/current-user', () => ({}));
vi.mock('../src/line/secure-configuration', () => ({}));

import { createFirstPostSuggestion } from '../src/http/user-registration';

describe('registration first post suggestion', () => {
  it('uses verified registration facts and a purpose-specific call to action', () => {
    const suggestion = createFirstPostSuggestion({
      activityName: '山田花子',
      businessName: '花子デザイン',
      productService: '小さなお店のロゴ制作',
      primaryPurpose: 'SALES',
    });

    expect(suggestion.title).toContain('花子デザイン');
    expect(suggestion.body).toContain('小さなお店のロゴ制作');
    expect(suggestion.body).toContain('お問い合わせ');
    expect(suggestion.generatedFrom).toEqual({
      purpose: 'SALES',
      hasBusinessName: true,
      hasProductService: true,
    });
  });

  it('does not invent a product when the optional product field is empty', () => {
    const suggestion = createFirstPostSuggestion({
      activityName: '地域活動チーム',
      businessName: null,
      productService: null,
      primaryPurpose: 'AWARENESS',
    });

    expect(suggestion.body).toContain('日々の活動や役立つ情報');
    expect(suggestion.body).not.toContain('「null」');
  });
});
