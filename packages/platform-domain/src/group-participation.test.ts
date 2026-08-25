import { describe, expect, it } from 'vitest';
import {
  GROUP_INVITATION_STATUSES,
  GROUP_MEMBERSHIP_STATUSES,
  GROUP_ROLES,
  GROUP_STATUSES,
} from './index';

describe('group participation domain values', () => {
  it('keeps consent lifecycle separate from invitation lifecycle', () => {
    expect(GROUP_STATUSES).toEqual(['ACTIVE', 'SUSPENDED', 'ARCHIVED']);
    expect(GROUP_ROLES).toEqual(['MANAGER', 'PARTICIPANT']);
    expect(GROUP_MEMBERSHIP_STATUSES).toEqual(['INVITED', 'ACTIVE', 'DECLINED', 'REVOKED']);
    expect(GROUP_INVITATION_STATUSES).toEqual(['ACTIVE', 'EXHAUSTED', 'EXPIRED', 'REVOKED']);
  });
});
