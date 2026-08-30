import { describe, expect, it } from 'vitest';
import {
  lineAuthReturnFromCookie,
  missionReturnPath,
  safeLineAuthReturnPath,
} from '../src/auth/line-return';

describe('LINE authentication return path', () => {
  it('accepts and canonicalizes only a signed Mission landing path', () => {
    expect(safeLineAuthReturnPath('/today?state=a%2Bb')).toBe('/today?state=a%2Bb');
    expect(missionReturnPath('a+b')).toBe('/today?state=a%2Bb');
  });

  it('accepts only an exact one-time Group invitation path', () => {
    const token = 'a'.repeat(43);
    expect(safeLineAuthReturnPath(`/groups/invitations/${token}`)).toBe(
      `/groups/invitations/${token}`,
    );
    expect(safeLineAuthReturnPath(`/groups/invitations/${token}?next=/admin`)).toBeNull();
    expect(safeLineAuthReturnPath(`/groups/invitations/${token}/extra`)).toBeNull();
  });

  it('accepts only an exact service entry path', () => {
    expect(safeLineAuthReturnPath('/s/side-job-support')).toBe('/s/side-job-support');
    expect(safeLineAuthReturnPath('/s/side-job-support?next=/admin')).toBeNull();
    expect(safeLineAuthReturnPath('/s/Bad-Slug')).toBeNull();
  });

  it('accepts only an exact service invitation path', () => {
    const token = 'a'.repeat(43);
    expect(safeLineAuthReturnPath(`/s/side-job-support/join/${token}`)).toBe(
      `/s/side-job-support/join/${token}`,
    );
    expect(safeLineAuthReturnPath(`/s/side-job-support/join/${token}?next=/admin`)).toBeNull();
    expect(safeLineAuthReturnPath(`/s/Bad-Slug/join/${token}`)).toBeNull();
  });

  it.each([
    'https://evil.example/today?state=x',
    '//evil.example/today?state=x',
    '/today?state=x&next=https://evil.example',
    '/today?state=x#fragment',
    '/bunshins',
    '/today',
  ])('rejects an unsafe return path: %s', (value) => {
    expect(safeLineAuthReturnPath(value)).toBeNull();
  });

  it('reads a valid encoded cookie and rejects malformed values', () => {
    const value = encodeURIComponent('/today?state=opaque');
    expect(lineAuthReturnFromCookie(`other=1; bunshin_line_auth_return=${value}`)).toBe(
      '/today?state=opaque',
    );
    expect(lineAuthReturnFromCookie('bunshin_line_auth_return=%E0%A4%A')).toBeNull();
  });
});
