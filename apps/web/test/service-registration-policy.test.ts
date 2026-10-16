import { describe, expect, it } from 'vitest';
import {
  serviceRegistrationModeFromPolicy,
  serviceRegistrationPolicyFromMode,
} from '../src/services/service-registration-policy';

describe('service registration policy', () => {
  it.each([
    ['PUBLIC', 'PUBLIC', 'AUTO'],
    ['APPROVAL_REQUIRED', 'PUBLIC', 'MANUAL'],
    ['INVITATION_ONLY', 'INVITATION_ONLY', 'AUTO'],
    ['INVITATION_APPROVAL_REQUIRED', 'INVITATION_ONLY', 'MANUAL'],
    ['CLOSED', 'CLOSED', 'AUTO'],
  ] as const)(
    'round-trips %s as independent access and approval choices',
    (mode, access, approval) => {
      expect(serviceRegistrationPolicyFromMode(mode)).toEqual({ access, approval });
      expect(serviceRegistrationModeFromPolicy(access, approval)).toBe(mode);
    },
  );

  it('keeps registration closed regardless of a stale approval choice', () => {
    expect(serviceRegistrationModeFromPolicy('CLOSED', 'MANUAL')).toBe('CLOSED');
  });
});
