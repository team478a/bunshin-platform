import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../app/(app)/groups/[groupId]/members/page.tsx', import.meta.url),
  'utf8',
);

describe('service onboarding progress for administrators', () => {
  it('shows completion state without selecting answer contents', () => {
    expect(source).toContain('serviceOnboardingResponse: { select: { completedAt: true } }');
    expect(source).toContain('初回設定の状況');
    expect(source).toContain('初回設定${membership.serviceOnboardingResponse');
    expect(source).not.toContain('serviceOnboardingResponse: { select: { answers: true } }');
  });

  it('distinguishes services without configured questions', () => {
    expect(source).toContain('readServiceOnboardingSettings');
    expect(source).toContain('このサービスには初回質問が設定されていません。');
  });
});
