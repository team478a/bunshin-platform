import { FORTUNE_PROFILE_STYLES } from '@bunshin/capability-fortune';
import { z } from 'zod';

const label = z.string().trim().min(1).max(100);
const guideText = z.string().trim().max(240);

const guideSchema = z
  .object({
    introduction: guideText,
    personality: guideText,
    language: guideText,
    readingRules: guideText,
    questionApproach: guideText,
    suggestionPolicy: guideText,
    imageUrl: z
      .string()
      .trim()
      .max(500)
      .refine((value) => {
        if (!value) return true;
        try {
          const url = new URL(value);
          return url.protocol === 'https:' && !url.username && !url.password;
        } catch {
          return false;
        }
      }),
  })
  .strict();

export const defaultFortuneGuide: z.infer<typeof guideSchema> = {
  introduction: '',
  personality: '',
  language: '',
  readingRules: '',
  questionApproach: '',
  suggestionPolicy: '',
  imageUrl: '',
};

export const fortuneGuidanceSettingsSchema = z
  .object({
    interestQuestion: label,
    consultationQuestion: label,
    styleQuestion: label,
    guideName: label,
    guide: guideSchema.optional(),
    followUpLimit: z.number().int().min(0).max(2).optional(),
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
