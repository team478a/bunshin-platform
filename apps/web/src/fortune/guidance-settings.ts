import { FORTUNE_PROFILE_STYLES } from '@bunshin/capability-fortune';
import { z } from 'zod';

const label = z.string().trim().min(1).max(100);

export const fortuneGuidanceSettingsSchema = z
  .object({
    interestQuestion: label,
    consultationQuestion: label,
    styleQuestion: label,
    guideName: label,
    defaultStyle: z.enum(FORTUNE_PROFILE_STYLES).nullable(),
    themeLabels: z.object({ LOVE: label, WORK: label, RELATIONSHIPS: label }).strict(),
    styleLabels: z.object({ GENTLE: label, DIRECT: label, REFLECTIVE: label }).strict(),
  })
  .strict();

export type FortuneGuidanceSettings = z.infer<typeof fortuneGuidanceSettingsSchema>;

export const defaultFortuneGuidanceSettings: FortuneGuidanceSettings = {
  interestQuestion: '今、どんなことが気になっていますか？',
  consultationQuestion: '具体的に知りたいことはありますか？',
  styleQuestion: 'どんな雰囲気が好みですか？',
  guideName: 'タロット案内役',
  defaultStyle: null,
  themeLabels: { LOVE: '恋愛', WORK: '仕事', RELATIONSHIPS: '人間関係' },
  styleLabels: { GENTLE: 'やさしく', DIRECT: '簡潔に', REFLECTIVE: 'じっくり考える' },
};

export const resolveFortuneGuidanceSettings = (value: unknown) =>
  fortuneGuidanceSettingsSchema.safeParse(value).data ?? defaultFortuneGuidanceSettings;
