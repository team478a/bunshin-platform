import { describe, expect, it } from 'vitest';
import { csv, safeCsvCell } from '../src/http/admin-report-export';

describe('admin report CSV', () => {
  it('prevents spreadsheet formulas from running', () => {
    expect(safeCsvCell('=HYPERLINK("bad")')).toBe('"\'=HYPERLINK(""bad"")"');
    expect(safeCsvCell('+1')).toBe('"\'+1"');
  });

  it('removes line breaks and emits an Excel-compatible BOM', () => {
    expect(csv([['名前', '一行目\r\n二行目']])).toBe('\uFEFF"名前","一行目 二行目"\r\n');
  });
});
