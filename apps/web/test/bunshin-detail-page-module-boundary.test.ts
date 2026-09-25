import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file: string) =>
  readFileSync(new URL(`../app/(app)/bunshins/[bunshinId]/${file}`, import.meta.url), 'utf8');

describe('personal Bunshin detail page module boundary', () => {
  it('keeps the route focused on authentication, loading and rendering', () => {
    const page = read('page.tsx');

    expect(page).toContain('currentUserProvider');
    expect(page).toContain('loadBunshinPageData');
    expect(page).toContain('buildBunshinEditorProps');
    expect(page).toContain('<BunshinEditor {...editorProps} />');
    expect(page).not.toContain("import('@bunshin/database')");
  });

  it('keeps scoped repository access in the data module', () => {
    const data = read('bunshin-page-data.ts');

    expect(data).toContain("import('@bunshin/database')");
    expect(data).toContain('workspaceId');
    expect(data).toContain('actorUserId');
    expect(data).toContain('bunshinId: bunshin.id');
  });

  it('keeps client-safe serialization out of the data module', () => {
    const data = read('bunshin-page-data.ts');
    const viewModel = read('bunshin-page-view-model.ts');

    expect(viewModel).toContain('buildBunshinEditorProps');
    expect(viewModel).toContain('toISOString()');
    expect(viewModel).not.toContain("import('@bunshin/database')");
    expect(data).not.toContain('BunshinEditorProps');
  });
});
