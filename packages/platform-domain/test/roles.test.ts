import { describe, expect, it } from 'vitest';
import { isPlatformRole, isWorkspaceRole, PLATFORM_ROLES, WORKSPACE_ROLES } from '../src';

describe('platform ownership roles', () => {
  it('keeps workspace roles explicit', () => {
    expect(WORKSPACE_ROLES).toEqual(['OWNER', 'ADMIN', 'MEMBER']);
    expect(isWorkspaceRole('OWNER')).toBe(true);
    expect(isWorkspaceRole('SUPER_ADMIN')).toBe(false);
  });

  it('keeps platform roles separate from workspace roles', () => {
    expect(PLATFORM_ROLES).toEqual(['SUPER_ADMIN', 'OPERATOR', 'SUPPORT', 'READ_ONLY']);
    expect(isPlatformRole('SUPER_ADMIN')).toBe(true);
    expect(isPlatformRole('OWNER')).toBe(false);
  });
});
