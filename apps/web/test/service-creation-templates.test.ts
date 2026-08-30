import { describe, expect, it } from 'vitest';
import { SERVICE_CREATION_TEMPLATES } from '../src/services/service-creation-templates';

describe('service creation templates', () => {
  it('prepares public registration and attribution for the side-hustle service', () => {
    expect(SERVICE_CREATION_TEMPLATES.SIDE_HUSTLE_AFFILIATE).toMatchObject({
      registrationMode: 'PUBLIC',
      lineEnabled: true,
      referralEnabled: true,
    });
  });

  it('keeps enterprise participation invitation-only by default', () => {
    expect(SERVICE_CREATION_TEMPLATES.ENTERPRISE_PROGRAM).toMatchObject({
      registrationMode: 'INVITATION_ONLY',
      inviteCodeEnabled: true,
      referralEnabled: false,
    });
  });
});
