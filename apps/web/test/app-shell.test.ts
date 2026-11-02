import { describe, expect, it } from 'vitest';
import {
  adminNavigationGroups,
  getActiveAdminNavigationHref,
  isAdminNavigationGroupActive,
  isNavigationItemActive,
} from '../app/ui/app-shell';

describe('authenticated app shell navigation', () => {
  it('keeps the parent destination active on nested screens', () => {
    expect(isNavigationItemActive('/bunshins/bunshin-1', '/bunshins')).toBe(true);
    expect(isNavigationItemActive('/knowledge/item-1', '/knowledge')).toBe(true);
    expect(isNavigationItemActive('/badges', '/badges')).toBe(true);
  });

  it('does not activate destinations with only a shared prefix', () => {
    expect(isNavigationItemActive('/accounting', '/account')).toBe(false);
    expect(isNavigationItemActive('/admin/line', '/account')).toBe(false);
  });

  it('keeps the dashboard active only at its own destination', () => {
    expect(isNavigationItemActive('/admin', '/admin')).toBe(true);
    expect(isNavigationItemActive('/admin/line', '/admin')).toBe(false);
    const activeGroups = adminNavigationGroups.filter((group) =>
      isAdminNavigationGroupActive('/admin/line', group),
    );
    expect(activeGroups.map((group) => group.label)).toEqual(['配信・コンテンツ管理']);
  });

  it('selects only the most specific destination for nested admin screens', () => {
    expect(getActiveAdminNavigationHref('/admin/badges/rewards')).toBe('/admin/badges/rewards');
    expect(getActiveAdminNavigationHref('/admin/badges/rewards/history')).toBe(
      '/admin/badges/rewards',
    );
    expect(getActiveAdminNavigationHref('/admin/groups/group-1/line')).toBe('/admin/groups');
    expect(getActiveAdminNavigationHref('/admin/line-other')).toBeUndefined();
    expect(getActiveAdminNavigationHref('/administrator')).toBeUndefined();
  });

  it('preserves all existing admin destinations without duplicates', () => {
    const destinations = adminNavigationGroups.flatMap((group) =>
      group.items.map((item) => item.href),
    );
    expect(destinations).toHaveLength(new Set(destinations).size);
    expect([...destinations].sort()).toEqual([
      '/admin',
      '/admin/access',
      '/admin/activity-rules',
      '/admin/alerts',
      '/admin/audits',
      '/admin/badges',
      '/admin/badges/rewards',
      '/admin/commercial-billing',
      '/admin/commercial-profitability',
      '/admin/connections',
      '/admin/deletions',
      '/admin/fortune',
      '/admin/groups',
      '/admin/images',
      '/admin/legal',
      '/admin/line',
      '/admin/organizations',
      '/admin/reports',
      '/admin/services',
      '/admin/support',
      '/admin/trends',
      '/admin/users',
      '/admin/videos',
    ]);
  });
});
