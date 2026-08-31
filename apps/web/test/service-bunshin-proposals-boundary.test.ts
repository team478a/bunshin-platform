import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../src/http/service-bunshin-proposals.ts', import.meta.url),
  'utf8',
);

describe('service Bunshin proposal boundary', () => {
  it('loads onboarding answers from the active actor membership only', () => {
    expect(source).toContain('workspaceId: service.workspaceId');
    expect(source).toContain('groupId: service.serviceId');
    expect(source).toContain('userId: actor.userId');
    expect(source).toContain("status: 'ACTIVE'");
    expect(source).toContain('serviceOnboardingResponse');
  });

  it('does not accept onboarding answers from the request body', () => {
    expect(source).not.toContain('request.json()');
    expect(source).not.toContain('answersSchema');
  });
});
