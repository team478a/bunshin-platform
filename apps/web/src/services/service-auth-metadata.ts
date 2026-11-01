import { serviceAuthReturnSlug } from '../auth/line-return';
import { isRouteNotFound } from '../navigation/route-not-found';
import { resolvePublicServiceContext } from './public-service';
import { serviceAuthBrandForSlug } from './service-auth-brand';

export async function serviceAuthMetadata(returnTo: string | null | undefined, title: string) {
  const slug = serviceAuthReturnSlug(returnTo);
  let configuration = null;
  if (slug) {
    try {
      configuration = (await resolvePublicServiceContext(slug)).configuration;
    } catch (error) {
      if (!isRouteNotFound(error)) throw error;
    }
  }
  const brand = serviceAuthBrandForSlug(slug, configuration);
  return { title: `${brand?.serviceName ?? 'ワタシワークス'}｜${title}` };
}
