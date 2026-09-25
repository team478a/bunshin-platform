import { loadVideoProjectDetailPageData } from './video-project-detail-data';
import { VideoProjectDetailView } from './video-project-detail-view';

export const dynamic = 'force-dynamic';

export default async function VideoProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string; videoProjectId: string }>;
  searchParams?: Promise<{ service?: string }>;
}) {
  const [values, query] = await Promise.all([params, searchParams]);
  const data = await loadVideoProjectDetailPageData(values, query?.service);

  return <VideoProjectDetailView data={data} />;
}
