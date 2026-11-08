import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../app/(app)/admin/ai/provider-configuration-editor.tsx', import.meta.url),
  'utf8',
);

describe('AI provider configuration editor', () => {
  it('keeps a stable form reference across the asynchronous save', () => {
    const capture = source.indexOf('const formElement = event.currentTarget;');
    const request = source.indexOf("await fetch('/api/admin/ai-provider-configurations'");
    const reset = source.indexOf('formElement.reset();');

    expect(capture).toBeGreaterThan(-1);
    expect(request).toBeGreaterThan(capture);
    expect(reset).toBeGreaterThan(request);
    expect(source).not.toContain('event.currentTarget.reset();');
  });

  it('keeps the active runtime visible while a newer draft is reviewed', () => {
    expect(source).toContain("configuration.status === 'ACTIVE'");
    expect(source).toContain(
      '?? configurations.find((configuration) => configuration.provider === value)',
    );
  });
});
