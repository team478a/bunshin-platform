import { describe, expect, it } from 'vitest';
import {
  EXTERNAL_TRACKING_CSV_MAX_ROWS,
  parseExternalTrackingCsv,
} from '../src/external-tracking/csv-import';

const bytes = (value: string) => new TextEncoder().encode(value);

describe('external tracking CSV parser', () => {
  it('BOM、引用符、空行を安全に読み取る', () => {
    const rows = parseExternalTrackingCsv(
      bytes(
        '\uFEFFemail,url,url_name\r\na@example.jp,"https://example.jp/a?x=1,2","名前,一"\r\n\r\n',
      ),
    );
    expect(rows).toEqual([
      expect.objectContaining({
        rowNumber: 2,
        email: 'a@example.jp',
        url: 'https://example.jp/a?x=1,2',
        url_name: '名前,一',
      }),
    ]);
  });

  it('未知の見出しを拒否する', () => {
    expect(() => parseExternalTrackingCsv(bytes('url,secret\nhttps://example.jp,x'))).toThrow(
      '使えない見出し',
    );
  });

  it('行数上限を超えるCSVを拒否する', () => {
    const rows = Array.from(
      { length: EXTERNAL_TRACKING_CSV_MAX_ROWS + 1 },
      () => 'https://example.jp',
    );
    expect(() => parseExternalTrackingCsv(bytes(`url\n${rows.join('\n')}`))).toThrow('1,000行');
  });
});
