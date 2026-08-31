import { describe, expect, it } from 'vitest';
import { SERVICE_CREATION_TEMPLATES } from '../src/services/service-creation-templates';

describe('service creation templates', () => {
  it('prepares public registration and attribution for the side-hustle service', () => {
    expect(SERVICE_CREATION_TEMPLATES.SIDE_HUSTLE_AFFILIATE).toMatchObject({
      registrationMode: 'PUBLIC',
      lineEnabled: true,
      referralEnabled: true,
    });
    expect(SERVICE_CREATION_TEMPLATES.SIDE_HUSTLE_AFFILIATE.onboarding.questions).toHaveLength(5);
    expect(SERVICE_CREATION_TEMPLATES.SIDE_HUSTLE_AFFILIATE.onboarding.welcomeTitle).not.toBe('');
  });

  it('keeps enterprise participation invitation-only by default', () => {
    expect(SERVICE_CREATION_TEMPLATES.ENTERPRISE_PROGRAM).toMatchObject({
      registrationMode: 'INVITATION_ONLY',
      inviteCodeEnabled: true,
      referralEnabled: false,
    });
    expect(SERVICE_CREATION_TEMPLATES.ENTERPRISE_PROGRAM.onboarding.questions).toHaveLength(6);
  });

  it('leaves onboarding empty when the administrator chooses custom settings', () => {
    expect(SERVICE_CREATION_TEMPLATES.CUSTOM.onboarding).toEqual({
      welcomeTitle: '',
      welcomeMessage: '',
      questions: [],
    });
  });
});
