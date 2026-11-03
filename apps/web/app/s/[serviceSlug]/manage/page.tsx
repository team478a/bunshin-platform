import { notFound } from 'next/navigation';
import { resolvePublicServiceContext } from '../../../../src/services/public-service';
import { isRouteNotFound } from '../../../../src/navigation/route-not-found';
import { serviceAuthBrandForSlug } from '../../../../src/services/service-auth-brand';
import { loadServiceManagementHome } from './service-management-home-data';
import { ServiceManagementAccessError } from './service-management-home-data';
import { ServiceManagementHomeView } from './service-management-home-view';
import { ServiceHomeAccessGuidance } from '../home/service-home-access-guidance';

export const dynamic = 'force-dynamic';

export default async function ServiceManagementHome({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  try {
    const model = await loadServiceManagementHome(serviceSlug);
    return <ServiceManagementHomeView model={model} />;
  } catch (error) {
    if (!(error instanceof ServiceManagementAccessError)) throw error;
    const publicService = await resolvePublicServiceContext(serviceSlug).catch((contextError) => {
      if (isRouteNotFound(contextError)) return null;
      throw contextError;
    });
    const brand = serviceAuthBrandForSlug(serviceSlug, publicService?.configuration);
    const serviceName = publicService?.configuration.displayName ?? brand?.serviceName;
    if (!serviceName) notFound();
    return (
      <ServiceHomeAccessGuidance
        state="MANAGEMENT_REQUIRED"
        serviceName={serviceName}
        serviceLogoUrl={publicService?.configuration.brand.logoUrl ?? brand?.logoUrl ?? null}
        poweredBy={publicService?.configuration.poweredByEnabled ?? brand?.poweredBy ?? false}
        brand={brand}
        serviceSlug={serviceSlug}
      />
    );
  }
}
