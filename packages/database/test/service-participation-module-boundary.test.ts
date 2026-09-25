import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (file: string) => readFileSync(join(process.cwd(), 'src', file), 'utf8');

describe('service participation repository modules', () => {
  it('keeps the public repository as a compatibility facade', () => {
    const facade = source('service-participation.ts');
    expect(facade).toContain('PrismaServiceParticipationRegistrationRepository');
    expect(facade).toContain('PrismaServiceParticipationMembershipRepository');
    expect(facade).not.toContain('$transaction');
    expect(facade).not.toContain('$queryRaw');
  });

  it('keeps registration and membership lifecycle persistence separated', () => {
    const registration = source('service-participation-registration-repository.ts');
    const membership = source('service-participation-membership-repository.ts');
    expect(registration).toContain('async findView');
    expect(registration).toContain('async request');
    expect(registration).not.toContain('async recordUse');
    expect(membership).toContain('async recordUse');
    expect(membership).toContain('async withdraw');
    expect(membership).toContain('async approve');
    expect(membership).not.toContain('async request');
  });

  it('keeps registration email delivery in a shared transaction helper', () => {
    const helper = source('service-registration-email.ts');
    const registration = source('service-participation-registration-repository.ts');
    const membership = source('service-participation-membership-repository.ts');
    expect(helper).toContain('serviceRegistrationEmailDelivery.createMany');
    expect(registration).toContain('enqueueRegistrationCompleteEmail(tx');
    expect(membership).toContain('enqueueRegistrationCompleteEmail(tx');
  });
});
