import { browserMaterialActor } from '../../../../../src/services/browser-materials';
import {
  missingVideo,
  videoFileQuery,
  videoResponse,
} from '../../../../../src/services/browser-material-video';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  const query = videoFileQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) return missingVideo();
  const { workspaceId } = await context.params;
  const owner = await browserMaterialActor(workspaceId);
  if (!owner) return missingVideo();
  const db = await import('@bunshin/database');
  const { material, variant } = query.data;
  const asset = await new db.PrismaBrowserMaterialVideos(db.prisma).readFile(
    { kind: 'owner', owner },
    material,
    variant,
  );
  return videoResponse(request, asset);
}
