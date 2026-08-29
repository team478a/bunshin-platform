export interface GroupBadgeCsvRow {
  line: number;
  email: string;
  badgeCode: string;
  reason: string;
}

export interface GroupBadgeCsvError {
  line: number;
  message: string;
}

function columns(line: string): string[] | null {
  const values: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === ',' && !quoted) {
      values.push(value.trim());
      value = '';
    } else value += character;
  }
  if (quoted) return null;
  values.push(value.trim());
  return values;
}

export function parseGroupBadgeCsv(csv: string): {
  rows: GroupBadgeCsvRow[];
  errors: GroupBadgeCsvError[];
} {
  const lines = csv.replace(/^\uFEFF/u, '').split(/\r?\n/u);
  const header = columns(lines[0] ?? '');
  if (!header || header.join(',').toLowerCase() !== 'email,badge_code,reason')
    return { rows: [], errors: [{ line: 1, message: '見出しが正しくありません。' }] };
  const rows: GroupBadgeCsvRow[] = [];
  const errors: GroupBadgeCsvError[] = [];
  for (let index = 1; index < lines.length; index += 1) {
    if (!lines[index]?.trim()) continue;
    if (rows.length + errors.length >= 500) {
      errors.push({ line: index + 1, message: '一度に登録できるのは500行までです。' });
      break;
    }
    const row = columns(lines[index] ?? '');
    const email = row?.[0]?.toLowerCase() ?? '';
    const badgeCode = row?.[1]?.toUpperCase() ?? '';
    const reason = row?.[2] ?? '';
    if (!row || row.length !== 3) {
      errors.push({ line: index + 1, message: '列の数または引用符が正しくありません。' });
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
      errors.push({ line: index + 1, message: 'メールアドレスが正しくありません。' });
    } else if (!/^[A-Z0-9][A-Z0-9_-]*$/u.test(badgeCode)) {
      errors.push({ line: index + 1, message: 'バッジコードが正しくありません。' });
    } else if (!reason || reason.length > 1000) {
      errors.push({ line: index + 1, message: '推薦理由を入力してください。' });
    } else rows.push({ line: index + 1, email, badgeCode, reason });
  }
  return { rows, errors };
}
