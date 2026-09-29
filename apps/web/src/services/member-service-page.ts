import 'server-only';
import type { Route } from 'next';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../auth/current-user';
import { serviceAuthReturnSlug } from '../auth/line-return';
import { isRouteNotFound } from '../navigation/route-not-found';
import { resolveMemberServiceContext } from './public-service';

/** ログインと参加状態を同じ順序で確認し、限定公開サービスの参加者画面を開く。 */
export async function resolveAuthenticatedMemberServicePage(serviceSlug: string, returnTo: string) {
  if (serviceAuthReturnSlug(returnTo) !== serviceSlug) notFound();
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect(`/login?returnTo=${encodeURIComponent(returnTo)}` as Route);

  try {
    const service = await resolveMemberServiceContext(serviceSlug, actor.userId);
    return { actor, service };
  } catch (error) {
    if (isRouteNotFound(error)) notFound();
    throw error;
  }
}
