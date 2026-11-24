import {
  browserMaterialActor,
  materialIdSchema,
  materialImageVariantSchema,
  readBrowserMaterialImage,
} from '../../../../../../../src/services/browser-materials';

export const dynamic = 'force-dynamic';

export async function GET(
  _: Request,
  context: {
    params: Promise<{ workspaceId: string; materialId: string; step: string; variant: string }>;
  },
) {
  const params = await context.params;
  const id = materialIdSchema.safeParse(params.materialId);
  const variant = materialImageVariantSchema.safeParse(params.variant);
  const hidden = () =>
    new Response(null, { status: 404, headers: { 'cache-control': 'private, no-store' } });
  if (!id.success || !variant.success || !/^[1-9]\d{0,8}$/.test(params.step)) return hidden();
  const actor = await browserMaterialActor(params.workspaceId);
  if (!actor) return hidden();
  const bytes = await readBrowserMaterialImage(actor, id.data, Number(params.step), variant.data);
  return bytes
    ? new Response(new Uint8Array(bytes), {
        headers: {
          'cache-control': 'private, no-store',
          'content-type': 'image/webp',
          'x-content-type-options': 'nosniff',
        },
      })
    : hidden();
}
