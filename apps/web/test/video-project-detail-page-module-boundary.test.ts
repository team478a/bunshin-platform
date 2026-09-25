import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file: string) =>
  readFileSync(
    new URL(`../app/(app)/groups/[groupId]/videos/[videoProjectId]/${file}`, import.meta.url),
    'utf8',
  );

describe('video project detail page module boundary', () => {
  it('keeps the route focused on loading and rendering', () => {
    const page = read('page.tsx');

    expect(page).toContain('loadVideoProjectDetailPageData');
    expect(page).toContain('<VideoProjectDetailView data={data} />');
    expect(page).not.toContain("import('@bunshin/database')");
  });

  it('keeps owner-scoped persistence in the data module', () => {
    const data = read('video-project-detail-data.ts');

    expect(data).toContain("import('@bunshin/database')");
    expect(data).toContain('ownerUserId: actor.userId');
    expect(data).toContain('workspaceId: project.workspaceId');
    expect(data).toContain('groupId: project.groupId');
  });

  it('keeps planning controls separate from data access and completion presentation', () => {
    const view = read('video-project-detail-view.tsx');
    const plan = read('video-project-plan-sections.tsx');

    expect(view).toContain('<VideoProjectPlanSections data={data} />');
    expect(plan).toContain('VideoPlanGenerator');
    expect(plan).toContain('VideoSceneEditor');
    expect(plan).toContain('VideoRenderRequester');
    expect(plan).not.toContain("import('@bunshin/database')");
  });
});
