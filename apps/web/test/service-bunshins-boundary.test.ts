import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const httpSource = readFileSync(
  new URL('../src/http/service-bunshins.ts', import.meta.url),
  'utf8',
);
const homeSource = readFileSync(
  new URL('../app/s/[serviceSlug]/home/page.tsx', import.meta.url),
  'utf8',
);

describe('service Bunshin web boundary', () => {
  it('resolves the service scope on the server instead of accepting IDs from the body', () => {
    expect(httpSource).toContain('resolvePublicServiceContext(serviceSlug)');
    expect(httpSource).toContain('groupId: service.serviceId');
    expect(httpSource).not.toContain('groupId: z.');
    expect(httpSource).not.toContain('workspaceId: z.');
  });

  it('uses the service-only repository list and exposes the member-home entry', () => {
    expect(httpSource).toContain('ListServiceBunshins');
    expect(homeSource).toContain('/bunshins` as Route');
    expect(homeSource).toContain('投稿パートナーを作る・見る');
  });
});
