import { FORTUNE_INTAKE_MAX_QUESTIONS, FORTUNE_PROFILE_STYLES } from '@bunshin/capability-fortune';
import { z } from 'zod';

const label = z.string().trim().min(1).max(100);
const guideText = z.string().trim().max(240);

const imageUrl = z
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
  });

export const fortuneCharacterRoles = {
  daily: 'ホーム・今日の占い',
  intake: '案内・ヒアリング・振り返り',
  deep: '深層鑑定',
} as const;
export const fortuneCharacterExpressions = {
  welcome: '挨拶',
  thinking: '準備中',
  result: '鑑定結果',
} as const;
const characterSchema = z
  .object({
    id: z
      .string()
      .trim()
      .regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
    name: label,
    enabled: z.boolean(),
    imageUrl,
    iconUrl: imageUrl,
    expressions: z
      .object({
        welcome: imageUrl.optional(),
        thinking: imageUrl.optional(),
        result: imageUrl.optional(),
      })
      .strict(),
  })
  .strict();
const charactersSchema = z
  .object({
    daily: characterSchema.optional(),
    intake: characterSchema.optional(),
    deep: characterSchema.optional(),
  })
  .strict();

export type FortuneCharacter = z.infer<typeof characterSchema>;

const guideSchema = z
  .object({
    introduction: guideText,
    personality: guideText,
    language: guideText,
    readingRules: guideText,
    questionApproach: guideText,
    suggestionPolicy: guideText,
    imageUrl,
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
    characters: charactersSchema.optional(),
    followUpLimit: z.number().int().min(0).max(2).optional(),
    deepReadingEnabled: z.boolean().optional(),
    intake: z
      .object({
        enabled: z.boolean(),
        questions: z.number().int().min(1).max(FORTUNE_INTAKE_MAX_QUESTIONS),
        calls: z.number().int().min(1).max(FORTUNE_INTAKE_MAX_QUESTIONS),
      })
      .strict()
      .optional(),
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
