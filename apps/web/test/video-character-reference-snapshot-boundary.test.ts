import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(
  new URL('../../../packages/database/prisma/schema.prisma', import.meta.url),
  'utf8',
);
const repository = readFileSync(
  new URL('../../../packages/database/src/index.ts', import.meta.url),
  'utf8',
);
const videoPage = readFileSync(
  new URL('../app/(app)/groups/[groupId]/videos/page.tsx', import.meta.url),
  'utf8',
);
const creator = readFileSync(
  new URL('../app/ui/video-project-creator.tsx', import.meta.url),
  'utf8',
);

describe('video character reference snapshot boundary', () => {
  it('persists a version id and immutable character/reference snapshots with the project', () => {
    expect(schema).toContain('characterProfileVersionId');
    expect(schema).toContain('characterProfileSnapshot');
    expect(schema).toContain('characterReferenceSnapshot');
    expect(repository).toContain('characterProfileSnapshot = {');
    expect(repository).toContain('characterReferenceSnapshot = references');
  });

  it('only offers active service characters with a published version and ready references', () => {
    expect(videoPage).toContain("status: 'PUBLISHED'");
    expect(videoPage).toContain("scope: 'SERVICE'");
    expect(videoPage).toContain("status: 'READY'");
    expect(creator).toContain('characterProfileVersionId');
  });

  it('revalidates the selected character inside the exact workspace and service scope', () => {
    expect(repository).toContain('id: input.characterProfileVersionId');
    expect(repository).toContain('workspaceId: input.workspaceId');
    expect(repository).toContain('groupId: input.groupId');
    expect(repository).toContain("status: 'PUBLISHED'");
    expect(repository).toContain("scope: 'SERVICE'");
    expect(repository).toContain("status: 'READY'");
    expect(repository).toContain('commercialUseAllowed: true');
    expect(repository).toContain('derivativeUseAllowed: true');
    expect(repository).toContain('redistributionAllowed: true');
  });
});
