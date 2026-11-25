import { ApplicationError } from '@bunshin/shared';
import { browserLearningMaterialActor } from '../../../../../../../../src/services/browser-learning-material';
import {
  missingVideo,
  videoFileQuery,
  videoResponse,
} from '../../../../../../../../src/services/browser-material-video';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ serviceSlug: string; programEnrollmentId: string }> },
) {
  const query = videoFileQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) return missingVideo();
  const { serviceSlug, programEnrollmentId } = await context.params;
  const { topicId, material, variant } = query.data;
  try {
    const learner = await browserLearningMaterialActor(serviceSlug, programEnrollmentId, topicId);
    const db = await import('@bunshin/database');
    const asset = await new db.PrismaBrowserMaterialVideos(db.prisma).readFile(
      { kind: 'learner', learner },
      material,
      variant,
    );
    return videoResponse(request, asset);
  } catch (error) {
    if (error instanceof ApplicationError && ['NOT_FOUND', 'FORBIDDEN'].includes(error.code))
      return missingVideo();
    throw error;
  }
}
