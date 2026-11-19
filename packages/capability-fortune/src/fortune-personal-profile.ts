export const FORTUNE_PROFILE_STYLES = ['GENTLE', 'DIRECT', 'REFLECTIVE'] as const;
export type FortuneProfileStyle = (typeof FORTUNE_PROFILE_STYLES)[number];

export interface FortunePersonalProfile {
  interest: string | null;
  question: string | null;
  style: FortuneProfileStyle | null;
  consented: boolean;
}

export type FortunePersonalProfileUpdate =
  { consented: false } | (Omit<FortunePersonalProfile, 'consented'> & { consented: true });

export const emptyFortunePersonalProfile: FortunePersonalProfile = {
  interest: null,
  question: null,
  style: null,
  consented: false,
};
