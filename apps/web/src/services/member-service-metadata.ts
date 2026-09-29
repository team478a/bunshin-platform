import 'server-only';
import type { Metadata } from 'next';
import { currentUserProvider } from '../auth/current-user';
import { isRouteNotFound } from '../navigation/route-not-found';
import { resolveMemberServiceContext } from './public-service';

/** Member-only pages must not resolve a public service just to build a title. */
export async function memberServiceMetadata(
  serviceSlug: string,
  pageTitle: string,
  fallbackTitle = pageTitle,
): Promise<Metadata> {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) return { title: fallbackTitle };
  try {
    const service = await resolveMemberServiceContext(serviceSlug, actor.userId);
    return { title: `${service.configuration.displayName}｜${pageTitle}` };
  } catch (error) {
    if (isRouteNotFound(error)) return { title: fallbackTitle };
    throw error;
  }
}
