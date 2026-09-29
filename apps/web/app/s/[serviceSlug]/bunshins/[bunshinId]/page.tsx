import type { Metadata } from 'next';
import { memberServiceMetadata } from '../../../../../src/services/member-service-metadata';
import { loadServiceBunshinDetail } from './service-bunshin-detail-data';
import { ServiceBunshinDetailView } from './service-bunshin-detail-view';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ serviceSlug: string; bunshinId: string }>;
}): Promise<Metadata> {
  return memberServiceMetadata((await params).serviceSlug, '投稿パートナーホーム');
}

export default async function ServiceBunshinDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ serviceSlug: string; bunshinId: string }>;
  searchParams: Promise<{ lineResult?: string }>;
}) {
  const { serviceSlug, bunshinId } = await params;
  const lineResult = (await searchParams).lineResult;
  const model = await loadServiceBunshinDetail({ serviceSlug, bunshinId, lineResult });
  return <ServiceBunshinDetailView model={model} />;
}
