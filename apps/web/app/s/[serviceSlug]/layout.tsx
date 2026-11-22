import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ORACLE_SERVICE_NAME, ORACLE_SERVICE_SLUG } from '../../../src/services/service-auth-brand';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}): Promise<Metadata> {
  const { serviceSlug } = await params;
  if (serviceSlug !== ORACLE_SERVICE_SLUG) return {};
  return { title: ORACLE_SERVICE_NAME, applicationName: ORACLE_SERVICE_NAME };
}

export default function ServiceLayout({ children }: { children: ReactNode }) {
  return children;
}
