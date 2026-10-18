import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { safeLineAuthReturnPath, serviceAuthLoginPath } from '../src/auth/line-return';

const root = new URL('../app/s/[serviceSlug]/', import.meta.url);
function pages(directory: URL, prefix = ''): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory()) return pages(new URL(`${entry.name}/`, directory), `${relative}/`);
    return entry.name === 'page.tsx' ? [relative] : [];
  });
}

describe('service authentication route inventory', () => {
  it('retains the exact learning request destination through the login entry', () => {
    const path = '/s/service-a/programs/11111111-1111-4111-8111-111111111111/learning-request';
    expect(serviceAuthLoginPath(path)).toBe(`/login?returnTo=${encodeURIComponent(path)}`);
  });
  it.each([
    '/s/service-a/programs/11111111-1111-4111-8111-111111111111/learning-request?start=true',
    '/s/service-a/programs/11111111-1111-4111-8111-111111111111/learning-request/extra',
    '/s/service-a/programs/11111111-1111-4111-8111-111111111111/learning-request#start',
    '/s/service-a/programs/11111111-1111-4111-8111-111111111111/%6cearning-request',
    '//example.com/s/service-a/programs/11111111-1111-4111-8111-111111111111/learning-request',
    '/s/service-a/programs/not-an-enrollment/learning-request',
  ])('rejects learning request aliases and unapproved extensions: %s', (path) => {
    expect(safeLineAuthReturnPath(path)).toBeNull();
  });
  it.each([
    '/s/service-a/manage/improvement-overview?week=2026-10-05',
    '/s/service-a/manage/improvement-overview/extra',
    '/s/service-a/manage/improvement-overview#details',
    '/s/service-a/manage/%69mprovement-overview',
    '//example.com/s/service-a/manage/improvement-overview',
  ])('rejects overview route aliases and unapproved extensions: %s', (path) => {
    expect(safeLineAuthReturnPath(path)).toBeNull();
  });
  it.each([
    '/s/service-a/manage/programs/personal-learning-preparation?start=true',
    '/s/service-a/manage/programs/personal-learning-preparation/extra',
    '/s/service-a/manage/programs/personal-learning-preparation#start',
    '/s/service-a/manage/programs/%70ersonal-learning-preparation',
    '//example.com/s/service-a/manage/programs/personal-learning-preparation',
  ])('rejects preparation route aliases and unapproved extensions: %s', (path) => {
    expect(safeLineAuthReturnPath(path)).toBeNull();
  });
  it.each([
    '/s/service-a/manage/programs/learning-definition-review?start=true',
    '/s/service-a/manage/programs/learning-definition-review/extra',
    '/s/service-a/manage/programs/learning-definition-review#start',
    '/s/service-a/manage/programs/%6cearning-definition-review',
    '//example.com/s/service-a/manage/programs/learning-definition-review',
  ])('rejects definition review route aliases and unapproved extensions: %s', (path) => {
    expect(safeLineAuthReturnPath(path)).toBeNull();
  });
  it.each([
    '/s/service-a/manage/programs/learning-conversations?shared=true',
    '/s/service-a/manage/programs/learning-conversations/11111111-1111-4111-8111-111111111111/extra',
    '/s/service-a/manage/programs/learning-conversations/not-a-request',
    '/s/service-a/manage/programs/learning-conversations#details',
    '//example.com/s/service-a/manage/programs/learning-conversations',
  ])('rejects learning conversation route aliases and unapproved extensions: %s', (path) => {
    expect(safeLineAuthReturnPath(path)).toBeNull();
  });
  it.each(pages(root).filter((page) => !['terms/page.tsx', 'privacy/page.tsx'].includes(page)))(
    'preserves existing project page %s',
    (page) => {
      const suffix = page
        .replace(/\/?page\.tsx$/, '')
        .replace('[token]', 'a'.repeat(43))
        .replace(/\[[^\]]+\]/g, '11111111-1111-4111-8111-111111111111');
      const path = `/s/service-a${suffix ? `/${suffix}` : ''}`;
      expect(safeLineAuthReturnPath(path)).toBe(path);
    },
  );

  it.each(['settings', 'line', 'email', 'templates', 'personalization', 'weekly-report'])(
    'retains project context in previously unscoped management entry: %s',
    (section) => {
      const source = readFileSync(new URL(`manage/${section}/page.tsx`, root), 'utf8');
      expect(source).toContain(`/s/\${serviceSlug}/manage/${section}`);
      expect(source).not.toContain("redirect('/login')");
      expect(source).toContain('resolveManagedServiceContext(serviceSlug, actor.userId)');
    },
  );
});
