import { z } from 'zod';
import { ApplicationError } from '@bunshin/shared';
import { requireSameOrigin } from '../../../../../src/auth/request-security';
import { boundedLearningJson } from '../../../../../src/http/personal-learning-request';
import {
  browserMaterialActor,
  readBrowserMaterial,
} from '../../../../../src/services/browser-materials';
import { videoResponse } from '../../../../../src/services/browser-material-video';
import { dialogueDraftSchema } from '../../../../../src/services/manaberu-dialogue-model';
import {
  DialogueProductionError,
  produceDialogue,
  readDialogueMedia,
  readDialogueProject,
  saveDialogueProject,
} from '../../../../../src/services/manaberu-dialogue-production';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 180;
const querySchema = z.object({
  material: z.uuid(),
  step: z.coerce.number().int().positive().max(1000),
  asset: z.enum(['mp4', 'audio']).optional(),
  render: z.uuid().optional(),
});
const inputSchema = z.strictObject({
  operation: z.enum(['save', 'render']),
  draft: dialogueDraftSchema,
});
const headers = { 'cache-control': 'private, no-store' };
type Context = { params: Promise<{ workspaceId: string }> };

async function verifiedLocation(request: Request, context: Context) {
  const { workspaceId } = await context.params;
  const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) return null;
  const owner = await browserMaterialActor(workspaceId);
  if (!owner) return null;
  const material = await readBrowserMaterial(owner, query.data.material);
  if (!material?.steps.some(({ ordinal }) => ordinal === query.data.step)) return null;
  return {
    owner,
    query: query.data,
    location: { materialId: material.id, ordinal: query.data.step },
  };
}

function errorResponse(error: unknown) {
  if (error instanceof DialogueProductionError)
    return Response.json({ message: error.message }, { status: error.status, headers });
  if (error instanceof ApplicationError) {
    const status = error.code === 'FORBIDDEN' ? 403 : 400;
    return Response.json(
      { message: '操作を確認してから、もう一度お試しください。' },
      { status, headers },
    );
  }
  console.warn('manaberu_dialogue_request_failed', error instanceof Error ? error.name : 'unknown');
  return Response.json(
    { message: '会話教材を準備できませんでした。VOICEVOXと動画の設定を確認してください。' },
    { status: 500, headers },
  );
}

export async function GET(request: Request, context: Context) {
  try {
    const target = await verifiedLocation(request, context);
    if (!target) return new Response(null, { status: 404, headers });
    const { owner, location, query } = target;
    if (!query.asset)
      return Response.json(await readDialogueProject(owner, location, request.signal), { headers });
    const asset = query.render
      ? await readDialogueMedia(owner, location, query.render, query.asset)
      : null;
    const response = videoResponse(request, asset);
    if (asset && query.asset === 'audio') response.headers.set('content-type', 'audio/wav');
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    requireSameOrigin(request);
    const target = await verifiedLocation(request, context);
    if (!target) return new Response(null, { status: 404, headers });
    const input = inputSchema.safeParse(await boundedLearningJson(request, 16_384));
    if (!input.success)
      return Response.json(
        {
          message:
            input.error.issues.find(({ code }) => code === 'custom')?.message ??
            '台本を確認してください。',
        },
        { status: 400, headers },
      );
    const { owner, location } = target;
    if (input.data.operation === 'save') {
      await saveDialogueProject(owner, location, input.data.draft);
      return Response.json({ saved: true }, { headers });
    }
    const summary = await produceDialogue(owner, location, input.data.draft, request.signal);
    return Response.json({ summary }, { headers });
  } catch (error) {
    return errorResponse(error);
  }
}
