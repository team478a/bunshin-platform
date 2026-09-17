import GroupImagesPage from '../../../(app)/groups/[groupId]/images/page';
import { resolveAuthenticatedMemberServicePage } from '../../../../src/services/member-service-page';
import { isPromptOnlyImageService } from '../../../../src/services/service-image-policy';
import type { Route } from 'next';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function ServiceImagesPage({
  params,
  searchParams,
}: {
  params: Promise<{ serviceSlug: string }>;
  searchParams: Promise<{ mission?: string }>;
}) {
  const { serviceSlug } = await params;
  const { service } = await resolveAuthenticatedMemberServicePage(
    serviceSlug,
    `/s/${serviceSlug}/images`,
  );
  if (isPromptOnlyImageService(service.configuration.slug)) {
    redirect(`/s/${service.configuration.slug}/bunshins` as Route);
  }
  return GroupImagesPage({
    params: Promise.resolve({ groupId: service.serviceId }),
    searchParams: Promise.resolve({ ...(await searchParams), service: service.configuration.slug }),
  });
}
