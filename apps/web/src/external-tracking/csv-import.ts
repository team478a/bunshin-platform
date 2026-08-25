import { ApplicationError } from '@bunshin/shared';

export const EXTERNAL_TRACKING_CSV_MAX_BYTES = 5 * 1024 * 1024;
export const EXTERNAL_TRACKING_CSV_MAX_ROWS = 1_000;
export const EXTERNAL_TRACKING_CSV_HEADERS = [
  'participant_id',
  'email',
  'external_member_id',
  'agency_id',
  'product_code',
  'campaign_code',
  'url_name',
  'external_link_id',
  'url',
  'starts_at',
  'expires_at',
] as const;

export type ExternalTrackingCsvRow = Record<
  (typeof EXTERNAL_TRACKING_CSV_HEADERS)[number],
  string
> & {
  rowNumber: number;
};

function parseRecords(source: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else cell += character;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (character !== '\r') cell += character;
  }
  if (quoted) throw new ApplicationError('VALIDATION_ERROR', 'CSVの引用符が閉じられていません。');
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export function parseExternalTrackingCsv(input: Uint8Array) {
  if (input.byteLength > EXTERNAL_TRACKING_CSV_MAX_BYTES)
    throw new ApplicationError('VALIDATION_ERROR', 'CSVは5MB以下にしてください。');
  const source = new TextDecoder('utf-8', { fatal: true }).decode(input).replace(/^\uFEFF/, '');
  const records = parseRecords(source);
  const header = records.shift()?.map((value) => value.trim().toLowerCase());
  if (!header?.length) throw new ApplicationError('VALIDATION_ERROR', 'CSVの見出しがありません。');
  const unknown = header.filter((value) => !EXTERNAL_TRACKING_CSV_HEADERS.includes(value as never));
  if (unknown.length)
    throw new ApplicationError(
      'VALIDATION_ERROR',
      `使えない見出しがあります：${unknown.join('、')}`,
    );
  if (!header.includes('url')) throw new ApplicationError('VALIDATION_ERROR', 'url列が必要です。');
  const dataRows = records.filter((record) => record.some((value) => value.trim()));
  if (dataRows.length > EXTERNAL_TRACKING_CSV_MAX_ROWS)
    throw new ApplicationError('VALIDATION_ERROR', 'CSVは1,000行以下にしてください。');
  return dataRows.map((record, index) => {
    if (record.length > header.length)
      throw new ApplicationError('VALIDATION_ERROR', `${index + 2}行目の列数が多すぎます。`);
    const values = Object.fromEntries(
      EXTERNAL_TRACKING_CSV_HEADERS.map((name) => [
        name,
        (record[header.indexOf(name)] ?? '').trim(),
      ]),
    ) as Record<(typeof EXTERNAL_TRACKING_CSV_HEADERS)[number], string>;
    return { ...values, rowNumber: index + 2 };
  });
}
