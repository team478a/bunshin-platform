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
