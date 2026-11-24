import { z } from 'zod';
import { ApplicationError } from '@bunshin/shared';
import { browserLearningMaterialActor } from '../../../../../../../../src/services/browser-learning-material';
import {
  materialIdSchema,
  materialImageVariantSchema,
} from '../../../../../../../../src/services/browser-materials';

export const dynamic = 'force-dynamic';

const inputSchema = z.object({
  topicId: z.uuid().optional(),
  material: materialIdSchema,
  step: z
    .string()
    .regex(/^[1-9]\d{0,8}$/)
    .transform(Number),
  variant: materialImageVariantSchema,
});
const headers = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' };
const absent = () => new Response(null, { status: 404, headers });

export async function GET(
  request: Request,
  context: {
    params: Promise<{ serviceSlug: string; programEnrollmentId: string }>;
  },
) {
  const input = inputSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!input.success) return absent();
  const { serviceSlug, programEnrollmentId } = await context.params;
  try {
    const { topicId, material, step, variant } = input.data;
    const actor = await browserLearningMaterialActor(serviceSlug, programEnrollmentId, topicId);
    const db = await import('@bunshin/database');
    const bytes = await new db.PrismaBrowserLearningMaterials(db.prisma).readImage(
      actor,
      material,
      step,
      variant,
    );
    return bytes
      ? new Response(new Uint8Array(bytes), {
          headers: { ...headers, 'content-type': 'image/webp' },
        })
      : absent();
  } catch (error) {
    if (error instanceof ApplicationError && ['NOT_FOUND', 'FORBIDDEN'].includes(error.code))
      return absent();
    throw error;
  }
}
