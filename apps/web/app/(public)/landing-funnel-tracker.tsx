'use client';
import { useEffect } from 'react';

const visitorKey = 'watashi_works_registration_visitor';

export function LandingFunnelTracker() {
  useEffect(() => {
    let visitorId = window.localStorage.getItem(visitorKey);
    if (!visitorId) {
      visitorId = crypto.randomUUID();
      window.localStorage.setItem(visitorKey, visitorId);
    }
    void fetch('/api/registration-funnel', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ eventType: 'LANDING_VIEWED', visitorId }),
      keepalive: true,
    }).catch(() => undefined);
  }, []);
  return null;
}
