import { describe, expect, it } from 'vitest';
import { isNavigationItemActive } from '../app/ui/app-shell';

describe('authenticated app shell navigation', () => {
  it('keeps the parent destination active on nested screens', () => {
    expect(isNavigationItemActive('/bunshins/bunshin-1', '/bunshins')).toBe(true);
    expect(isNavigationItemActive('/knowledge/item-1', '/knowledge')).toBe(true);
  });

  it('does not activate destinations with only a shared prefix', () => {
    expect(isNavigationItemActive('/accounting', '/account')).toBe(false);
    expect(isNavigationItemActive('/admin/line', '/account')).toBe(false);
  });
});
