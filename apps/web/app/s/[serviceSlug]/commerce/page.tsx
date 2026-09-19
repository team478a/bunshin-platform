import { ServiceLegalPage } from '../service-legal-page';

export const dynamic = 'force-dynamic';

export default async function CommerceDisclosurePage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  return <ServiceLegalPage serviceSlug={(await params).serviceSlug} type="COMMERCE_DISCLOSURE" />;
}
