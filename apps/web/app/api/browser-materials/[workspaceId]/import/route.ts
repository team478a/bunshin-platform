import { z } from 'zod';
import { ApplicationError } from '@bunshin/shared';
import { requireSameOrigin } from '../../../../../src/auth/request-security';
import {
  browserMaterialActor,
  saveMimikMaterial,
} from '../../../../../src/services/browser-materials';
import {
  InvalidMimikRecording,
  maxMimikBytes,
  parseMimikMaterial,
} from '../../../../../src/services/mimik-material-import';

const deviceSchema = z.enum(['desktop', 'mobile']);
const headers = { 'cache-control': 'private, no-store' };
const fail = (status: number) => new Response(null, { status, headers });

async function boundedRecording(body: ReadableStream<Uint8Array> | null) {
  if (!body) throw new InvalidMimikRecording();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) return Buffer.concat(chunks, total);
      total += next.value.byteLength;
      if (total > maxMimikBytes) {
        await reader.cancel();
        throw new InvalidMimikRecording();
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  try {
    requireSameOrigin(request);
    const { workspaceId } = await context.params;
    const actor = await browserMaterialActor(workspaceId);
    if (!actor) return fail(404);
    const device = deviceSchema.safeParse(request.headers.get('x-mimik-device'));
    if (
      !device.success ||
      request.headers.get('x-mimik-reviewed') !== 'true' ||
      request.headers.get('content-type') !== 'application/octet-stream'
    )
      return fail(400);
    if (Number(request.headers.get('content-length')) > maxMimikBytes) return fail(413);

    const material = await parseMimikMaterial(await boundedRecording(request.body));
    return Response.json(await saveMimikMaterial(actor, device.data, material), { headers });
  } catch (error) {
    if (error instanceof InvalidMimikRecording) return fail(400);
    if (error instanceof ApplicationError && error.code === 'FORBIDDEN') return fail(403);
    if (error instanceof ApplicationError && error.code === 'NOT_FOUND') return fail(404);
    throw error;
  }
}
