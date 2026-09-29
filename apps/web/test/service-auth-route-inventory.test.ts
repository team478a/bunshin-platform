import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { safeLineAuthReturnPath } from '../src/auth/line-return';

const root = new URL('../app/s/[serviceSlug]/', import.meta.url);
function pages(directory: URL, prefix = ''): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory()) return pages(new URL(`${entry.name}/`, directory), `${relative}/`);
    return entry.name === 'page.tsx' ? [relative] : [];
  });
}

describe('service authentication route inventory', () => {
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
