import { redirect } from 'next/navigation';
import { currentUserProvider } from '../../../src/auth/current-user';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login?returnTo=%2Fadmin');
  const db = await import('@bunshin/database');
  const admin = await new db.PrismaPlatformAdminRepository().findActivePlatformAdminByUserId(
    actor.userId,
  );
  if (!admin) redirect('/login/admin-access');
  return children;
}
