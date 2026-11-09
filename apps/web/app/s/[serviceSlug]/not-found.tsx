'use client';

import { useParams } from 'next/navigation';
import { PublicShell } from '../../ui/public-shell';
import { ServiceNotFoundCard } from './service-not-found-card';

export default function ServiceNotFound() {
  const params = useParams();
  const rawServiceSlug = params['serviceSlug'];
  const serviceSlug = Array.isArray(rawServiceSlug) ? rawServiceSlug[0] : rawServiceSlug;

  return (
    <PublicShell narrow>
      <ServiceNotFoundCard serviceSlug={serviceSlug ?? ''} />
    </PublicShell>
  );
}
