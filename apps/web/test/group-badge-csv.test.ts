import { describe, expect, it } from 'vitest';
import { parseGroupBadgeCsv } from '../src/badges/group-badge-csv';

describe('group badge CSV', () => {
  it('parses valid rows and quoted reasons', () => {
    expect(
      parseGroupBadgeCsv('email,badge_code,reason\nUSER@example.jp,helper,"よく助けました"'),
    ).toEqual({
      rows: [
        {
          line: 2,
          email: 'user@example.jp',
          badgeCode: 'HELPER',
          reason: 'よく助けました',
        },
      ],
      errors: [],
    });
  });

  it('keeps valid rows when another row is invalid', () => {
    const result = parseGroupBadgeCsv(
      'email,badge_code,reason\nok@example.jp,HELPER,推薦理由\nbad,HELPER,推薦理由',
    );
    expect(result.rows).toHaveLength(1);
    expect(result.errors).toEqual([{ line: 3, message: 'メールアドレスが正しくありません。' }]);
  });

  it('rejects an unexpected header', () => {
    expect(parseGroupBadgeCsv('name,badge,reason')).toEqual({
      rows: [],
      errors: [{ line: 1, message: '見出しが正しくありません。' }],
    });
  });
});
