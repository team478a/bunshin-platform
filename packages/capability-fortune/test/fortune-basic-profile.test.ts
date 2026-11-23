import { describe, expect, it } from 'vitest';
import { fortuneBirthDateIssue } from '../src/index';

describe('fortune basic profile birth date', () => {
  const now = new Date('2026-11-22T15:00:00Z');

  it.each(['1992-02-29', '2008-11-23', '1990-06-10'])('accepts %s', (value) => {
    expect(fortuneBirthDateIssue(value, now)).toBeNull();
  });

  it.each(['2001-02-29', '1990-04-31', '1990-13-01', '0000-01-01', '1990-1-01'])(
    'rejects %s',
    (value) => expect(fortuneBirthDateIssue(value, now)).toBe('INVALID_DATE'),
  );

  it('uses the Japanese date and the eighteenth birthday', () => {
    expect(fortuneBirthDateIssue('2008-11-23', new Date(now.getTime() - 1))).toBe('UNDERAGE');
    expect(fortuneBirthDateIssue('2008-11-24', now)).toBe('UNDERAGE');
    expect(fortuneBirthDateIssue('2026-11-24', now)).toBe('FUTURE_DATE');
  });

  it('handles a leap birthday in a non-leap year', () => {
    expect(fortuneBirthDateIssue('2008-02-29', new Date('2026-02-28T14:59:59Z'))).toBe('UNDERAGE');
    expect(fortuneBirthDateIssue('2008-02-29', new Date('2026-02-28T15:00:00Z'))).toBeNull();
  });
});
