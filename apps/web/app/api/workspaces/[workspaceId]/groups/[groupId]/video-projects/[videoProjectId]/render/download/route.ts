import { currentUserProvider } from '../../../../../../../../../../src/auth/current-user';
import { SupabaseVideoRenderOutputStorage } from '../../../../../../../../../../src/video/video-render-output-storage';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: {
    params: Promise<{ workspaceId: string; groupId: string; videoProjectId: string }>;
  },
) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) return new Response(null, { status: 401 });
  const parsed = z
    .object({ workspaceId: z.uuid(), groupId: z.uuid(), videoProjectId: z.uuid() })
    .safeParse(await context.params);
  if (!parsed.success) return new Response(null, { status: 404 });
  const db = await import('@bunshin/database');
  const render = await db.prisma.videoRender.findFirst({
    where: {
      workspaceId: parsed.data.workspaceId,
      groupId: parsed.data.groupId,
      videoProjectId: parsed.data.videoProjectId,
      ownerUserId: actor.userId,
      status: 'SUCCEEDED',
      outputStorageKey: { not: null },
    },
    orderBy: { completedAt: 'desc' },
    select: { outputStorageKey: true },
  });
  if (!render?.outputStorageKey) return new Response(null, { status: 404 });
  const url = await new SupabaseVideoRenderOutputStorage().createDownloadUrl(
    render.outputStorageKey,
  );
  return Response.redirect(url, 302);
}
