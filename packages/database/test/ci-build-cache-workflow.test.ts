import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  new URL('../../../.github/workflows/ci.yml', import.meta.url),
  'utf8',
);

describe('CI build cache trust boundary', () => {
  it('restores only generated Turbo and Next caches for verify runs', () => {
    expect(workflow).toContain('uses: actions/cache/restore@v4');
    expect(workflow).toContain('id: ci-build-cache');
    expect(workflow).toContain('.turbo');
    expect(workflow).toContain('apps/web/.next/cache');
    expect(workflow).toContain("hashFiles('pnpm-lock.yaml', 'turbo.json')");
    expect(workflow).not.toMatch(/\.env|DATABASE_URL.*cache|DIRECT_URL.*cache/);
  });

  it('saves the cache only after a successful trusted main push', () => {
    expect(workflow).toContain('uses: actions/cache/save@v4');
    expect(workflow).toContain("github.event_name == 'push'");
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain("steps.ci-build-cache.outputs.cache-hit != 'true'");
    expect(workflow).toContain('key: ${{ steps.ci-build-cache.outputs.cache-primary-key }}');
    expect(workflow).not.toContain('pull_request_target:');
    expect(workflow.match(/uses: actions\/cache\/save@v4/g)).toHaveLength(1);
  });

  it('keeps both required CI jobs and cancellation of obsolete runs', () => {
    expect(workflow).toMatch(/\n\s{2}verify:\n/);
    expect(workflow).toMatch(/\n\s{2}database:\n/);
    expect(workflow).toContain('cancel-in-progress: true');
  });
});
