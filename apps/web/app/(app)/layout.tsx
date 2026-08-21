import { GetRequiredLegalConsents } from '@bunshin/application';
import { redirect } from 'next/navigation';
import { currentUserProvider } from '../../src/auth/current-user';

export const dynamic = 'force-dynamic';

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');
  const db = await import('@bunshin/database');
  const documents = await new GetRequiredLegalConsents(
    new db.PrismaLegalConsentRepository(),
  ).execute(user.userId);
  if (documents.some((item) => !item.consentedAt)) redirect('/consent');
  return children;
}
