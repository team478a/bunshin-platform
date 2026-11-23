import { toJapanLocalDate } from './fortune-reading';

export const FORTUNE_BASIC_PROFILE_SEXES = ['MALE', 'FEMALE', 'OTHER'] as const;
export type FortuneBasicProfileSex = (typeof FORTUNE_BASIC_PROFILE_SEXES)[number];

export interface FortuneBasicProfileFields {
  nickname: string | null;
  birthDate: string | null;
  sex: FortuneBasicProfileSex | null;
  sexDescription: string | null;
}

export interface FortuneBasicProfile extends FortuneBasicProfileFields {
  consentedAt: string;
  createdAt: string;
  updatedAt: string;
}

export function fortuneBirthDateIssue(value: string, now: Date) {
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return 'INVALID_DATE';
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    return 'INVALID_DATE';
  const today = toJapanLocalDate(now);
  if (value > today) return 'FUTURE_DATE';
  const adultYear = Number(today.slice(0, 4)) - 18;
  const adultCutoff = `${String(adultYear).padStart(4, '0')}${today.slice(4)}`;
  return value > adultCutoff ? 'UNDERAGE' : null;
}
