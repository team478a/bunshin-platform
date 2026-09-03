import { z } from 'zod';
import { currentUserProvider } from '../../../../../../../../../../../src/auth/current-user';
import { SupabaseFalVideoSceneOutputStorage } from '../../../../../../../../../../../src/video/fal-video-scene-output-storage';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: {
    params: Promise<{
      workspaceId: string;
      groupId: string;
      videoProjectId: string;
      generationId: string;
    }>;
  },
) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) return new Response(null, { status: 401 });
  const parsed = z
    .object({
      workspaceId: z.uuid(),
      groupId: z.uuid(),
      videoProjectId: z.uuid(),
      generationId: z.uuid(),
    })
    .safeParse(await context.params);
  if (!parsed.success) return new Response(null, { status: 404 });
  const db = await import('@bunshin/database');
  const generation = await db.prisma.videoSceneGeneration.findFirst({
    where: {
      id: parsed.data.generationId,
      workspaceId: parsed.data.workspaceId,
      groupId: parsed.data.groupId,
      videoProjectId: parsed.data.videoProjectId,
      ownerUserId: actor.userId,
      status: 'SUCCEEDED',
      outputStorageKey: { not: null },
    },
    select: { outputStorageKey: true },
  });
  if (!generation?.outputStorageKey) return new Response(null, { status: 404 });
  const url = await new SupabaseFalVideoSceneOutputStorage().createDownloadUrl(
    generation.outputStorageKey,
  );
  return Response.redirect(url, 302);
}
