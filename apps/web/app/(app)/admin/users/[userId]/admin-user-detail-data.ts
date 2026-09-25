import { GetAdminUserDetail, type AdminUserDetail } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { currentLineEnvironment } from '../../../../../src/line/secure-configuration';

export interface AdminUserDetailPageData {
  detail: AdminUserDetail;
  administrators: Array<{ userId: string; displayName: string }>;
}

export async function loadAdminUserDetailPageData(
  userId: string,
): Promise<AdminUserDetailPageData> {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');

  const db = await import('@bunshin/database');
  try {
    const detail = await new GetAdminUserDetail(new db.PrismaAdminOperationsRepository()).execute({
      actorUserId: actor.userId,
      userId,
      environment: currentLineEnvironment(),
    });
    const management = await new db.PrismaPlatformAdminRepository().listForManagement(actor.userId);
    const administrators =
      management?.admins
        .filter((item) => item.status === 'ACTIVE')
        .map((item) => ({
          userId: item.userId,
          displayName: item.user.displayName,
        })) ?? [];

    return { detail, administrators };
  } catch (error) {
    if (error instanceof ApplicationError && error.code === 'NOT_FOUND') notFound();
    throw error;
  }
}
