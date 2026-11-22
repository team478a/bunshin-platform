'use client';

import { useEffect, useRef } from 'react';

export function FortuneVisit({ serviceSlug }: { serviceSlug: string }) {
  const submitted = useRef(false);
  useEffect(() => {
    if (submitted.current) return;
    submitted.current = true;
    const query = new URLSearchParams(location.search);
    void fetch(`/api/services/${serviceSlug}/fortune/visit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        source: query.get('utm_source')?.slice(0, 64) ?? null,
        medium: query.get('utm_medium')?.slice(0, 64) ?? null,
        campaign: query.get('utm_campaign')?.slice(0, 64) ?? null,
      }),
      keepalive: true,
    }).catch(() => undefined);
  }, [serviceSlug]);
  return null;
}
