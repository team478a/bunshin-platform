import type { ServiceFoundationRecord } from '@bunshin/application';

export interface ServiceAuthBrand {
  serviceName: string;
  logoUrl: string | null;
  poweredBy: boolean;
}

const INDEPENDENT_SERVICE_BRANDS: Record<string, string> = {
  'manaberu-style': 'マナベルスタイル',
  hassy: 'ハッシー',
  'sennokuni-media': '千ノ国メディア',
};

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

  const serviceName = slug ? INDEPENDENT_SERVICE_BRANDS[slug] : undefined;
  if (serviceName) {
    return {
      serviceName,
      logoUrl: null,
      poweredBy: true,
    };
  }

  return null;
}
