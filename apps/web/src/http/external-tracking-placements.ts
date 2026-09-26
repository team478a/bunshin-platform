import 'server-only';
import { z } from 'zod';
import { requireSameOrigin } from '../auth/request-security';
import {
  externalLinkPlacementService as placementService,
  externalTrackingJson as json,
  externalTrackingResponse as respond,
  externalTrackingUuid as uuid,
} from './external-tracking-http-core';

const placementSchema = z
  .object({
    productPackVersionId: uuid,
    platform: z.enum(['INSTAGRAM', 'TIKTOK', 'X', 'THREADS', 'YOUTUBE_SHORTS', 'OTHER']),
    format: z.enum(['TEXT', 'SLIDE', 'LIVE_ACTION', 'AI_VIDEO_PROMPT', 'IMAGE']),
    target: z.enum(['BODY', 'CAPTION', 'DESCRIPTION']),
    template: z.string().min(1).max(2000),
    status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  })
  .strict();
export function listExternalLinkPlacementsResponse(request: Request, workspaceId: string) {
  return respond(request, async () => {
    const productPackVersionId = uuid.parse(
      new URL(request.url).searchParams.get('productPackVersionId'),
    );
    const { scope, value } = await placementService(workspaceId);
    return value.list({ ...scope, productPackVersionId });
  });
}

export function upsertExternalLinkPlacementResponse(request: Request, workspaceId: string) {
  return respond(request, async () => {
    requireSameOrigin(request);
    const input = placementSchema.parse(await json(request));
    const { scope, value } = await placementService(workspaceId);
    return value.upsert({ ...scope, ...input, status: input.status ?? 'ACTIVE' });
  });
}
