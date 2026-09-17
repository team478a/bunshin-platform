import type { Metadata } from 'next';
import { ServiceLegalPage } from '../service-legal-page';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'プライバシーポリシー' };

export default async function ServicePrivacyPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  return <ServiceLegalPage serviceSlug={(await params).serviceSlug} type="PRIVACY" />;
}
