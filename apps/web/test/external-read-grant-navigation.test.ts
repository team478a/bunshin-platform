import { describe, expect, it } from 'vitest';
import { safeLineAuthReturnPath } from '../src/auth/line-return';
import { externalReadClientCatalog } from '../src/services/external-read-client-catalog';
describe('external grant navigation and closed catalog', () => {
  it('starts with no verified external clients', () => {
    expect(externalReadClientCatalog()).toEqual([]);
  });
  it('allows only the scoped owner page as a login return', () => {
    const path = '/s/hassy/bunshins/11111111-1111-4111-8111-111111111111/connections';
    expect(safeLineAuthReturnPath(path)).toBe(path);
    expect(safeLineAuthReturnPath(path + '/other')).toBeNull();
    expect(safeLineAuthReturnPath('https://evil.example' + path)).toBeNull();
    expect(safeLineAuthReturnPath(path + '?userId=other')).toBeNull();
  });
});
