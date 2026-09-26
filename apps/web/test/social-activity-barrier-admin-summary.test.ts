import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync(
  new URL('../app/s/[serviceSlug]/manage/personalization/page.tsx', import.meta.url),
  'utf8',
);

describe('social activity barrier admin summary', () => {
  it('shows aggregate confirmation and support states without member answers', () => {
    expect(page).toContain('getSocialActivityBarrierServiceSummary');
    expect(page).toContain('続けにくさとサポート状況');
    expect(page).toContain('本人が回答して確定した項目だけを集計');
    expect(page).toContain('サポート中');
    expect(page).toContain('できた記録');
    expect(page).not.toContain('selectedCategory');
    expect(page).not.toContain('definitionSnapshot');
  });
});
