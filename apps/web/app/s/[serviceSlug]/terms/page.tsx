import type { Metadata } from 'next';
import { ServiceLegalPage } from '../service-legal-page';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '利用規約' };

export default async function ServiceTermsPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  return <ServiceLegalPage serviceSlug={(await params).serviceSlug} type="TERMS" />;
}
