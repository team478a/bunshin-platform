import type { ServiceFoundationRecord } from '@bunshin/application';

export const MANABERU_SERVICE_SLUG = 'manaberu-style';
export const ORACLE_SERVICE_SLUG = 'watashi-fortune';
export const ORACLE_SERVICE_NAME = '月と星のオラクル';

export interface ServiceAuthBrand {
  serviceName: string;
  logoUrl: string | null;
  poweredBy: boolean;
}

const INDEPENDENT_SERVICE_BRANDS: Record<string, string> = {
  [MANABERU_SERVICE_SLUG]: 'マナベルスタイル',
  hassy: 'ハッシー',
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
