import type { ServiceFoundationRecord } from '@bunshin/application';

export interface ServiceAuthBrand {
  serviceName: string;
  logoUrl: string | null;
  poweredBy: boolean;
}

/**
 * Login branding may use public service configuration or an explicitly approved
 * brand-only alias. The alias never supplies membership or service-state data.
 */
export function serviceAuthBrandForSlug(
  slug: string | null,
  configuration?: ServiceFoundationRecord | null,
): ServiceAuthBrand | null {
  if (configuration) {
    return {
      serviceName: configuration.displayName,
      logoUrl: configuration.brand.logoUrl,
      poweredBy: configuration.poweredByEnabled,
    };
  }

  if (slug === 'manaberu-style') {
    return {
      serviceName: 'マナベルスタイル',
      logoUrl: null,
      poweredBy: true,
    };
  }

  return null;
}
