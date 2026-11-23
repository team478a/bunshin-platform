import { isFortuneCardImageUrl } from '@bunshin/capability-fortune';
import { z } from 'zod';

const imageUrl = z
  .string()
  .trim()
  .refine(isFortuneCardImageUrl, '公開HTTPS画像URLを入力してください。');

export const fortuneDeckChangeSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('standard'),
      code: z.string().max(40),
      imageUrl: z.union([imageUrl, z.literal('')]),
    })
    .strict(),
  z
    .object({
      kind: z.literal('custom'),
      code: z.string().max(40).optional(),
      nameJa: z.string().trim().min(1).max(50),
      imageUrl,
      enabled: z.boolean(),
      meanings: z
        .array(
          z
            .object({
              orientation: z.enum(['UPRIGHT', 'REVERSED']),
              theme: z.enum(['LOVE', 'WORK', 'RELATIONSHIPS']),
              title: z.string().trim().min(1).max(160),
              body: z.string().trim().min(1).max(700),
              actionStep: z.string().trim().min(1).max(200),
            })
            .strict(),
        )
        .length(6),
    })
    .strict(),
]);

export type FortuneDeckChange = z.infer<typeof fortuneDeckChangeSchema>;
