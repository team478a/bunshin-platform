import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requiresPlatformOnboarding, safeLineAuthReturnPath } from '../src/auth/line-return';

const mocks = vi.hoisted(() => ({ user: vi.fn(), admin: vi.fn() }));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: mocks.user }),
}));
vi.mock('@bunshin/database', () => ({
  PrismaPlatformAdminRepository: class {
    findActivePlatformAdminByUserId = mocks.admin;
  },
}));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
import AdminLayout from '../app/(app)/admin/layout';

describe('platform admin access guidance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('sends an unauthenticated visitor to login with the admin destination', async () => {
    mocks.user.mockResolvedValue(null);
    await expect(AdminLayout({ children: 'secret' })).rejects.toThrow(
      'REDIRECT:/login?returnTo=%2Fadmin',
    );
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it('sends a signed-in non-admin to guidance instead of a 404', async () => {
    mocks.user.mockResolvedValue({ userId: 'member' });
    mocks.admin.mockResolvedValue(null);
    await expect(AdminLayout({ children: 'secret' })).rejects.toThrow(
      'REDIRECT:/login/admin-access',
    );
    expect(mocks.admin).toHaveBeenCalledWith('member');
  });
  it('allows an active admin through and preserves authorization at destination pages', async () => {
    mocks.user.mockResolvedValue({ userId: 'operator' });
    mocks.admin.mockResolvedValue({ role: 'OPERATOR' });
    expect(await AdminLayout({ children: 'authorized content' })).toBe('authorized content');
  });
  it('permits only the exact admin landing return and avoids participant onboarding', () => {
    expect(safeLineAuthReturnPath('/admin')).toBe('/admin');
    expect(safeLineAuthReturnPath('/admin?next=https://example.com')).toBeNull();
    expect(safeLineAuthReturnPath('/admin/access')).toBeNull();
    expect(requiresPlatformOnboarding(null, '/admin')).toBe(false);
  });
});
