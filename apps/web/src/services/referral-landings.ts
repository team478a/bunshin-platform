import { z } from 'zod';

const landingUrl = z
  .string()
  .trim()
  .max(2048)
  .transform((value, ctx) => {
    try {
      const url = new URL(value);
      const normalized = url.toString();
      if (
        /^https:\/\//i.test(value) &&
        url.protocol === 'https:' &&
        !url.username &&
        !url.password &&
        normalized.length <= 2048
      )
        return normalized;
    } catch {
      // Invalid input is reported below.
    }
    ctx.addIssue({ code: 'custom', message: '公開LPのHTTPS URLを入力してください。' });
    return z.NEVER;
  });

export const referralLandingsSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    activeId: z.uuid().nullable(),
    pages: z
      .array(
        z
          .object({
            id: z.uuid(),
            name: z.string().trim().min(1).max(80),
            url: landingUrl,
          })
          .strict(),
      )
      .max(20),
  })
  .strict()
  .refine(
    ({ activeId, pages }) =>
      new Set(pages.map((page) => page.id)).size === pages.length &&
      (activeId === null || pages.some((page) => page.id === activeId)),
  );

export type ReferralLandings = z.infer<typeof referralLandingsSchema>;

export function readReferralLandings(value: unknown): ReferralLandings {
  const parsed = referralLandingsSchema.safeParse(value);
  return parsed.success ? parsed.data : { revision: 0, activeId: null, pages: [] };
}

export function referralDestination(
  requestUrl: URL,
  input: { slug: string; code: string; clickId: string; settings: unknown },
): URL {
  const { activeId, pages } = readReferralLandings(input.settings);
  const active = pages.find((page) => page.id === activeId);
  const external = active ? new URL(active.url) : null;
  const destination =
    external && !(external.hostname === requestUrl.hostname && external.pathname.startsWith('/r/'))
      ? external
      : new URL(`/s/${input.slug}`, requestUrl);
  destination.searchParams.set('ref', input.code);
  destination.searchParams.set('rc', input.clickId);
  return destination;
}
