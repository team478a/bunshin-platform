import { GetBunshin } from '@bunshin/application';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { BunshinEditor } from './editor';

export const dynamic = 'force-dynamic';

export default async function BunshinPage({
  params,
  searchParams,
}: {
  params: Promise<{ bunshinId: string }>;
  searchParams: Promise<{ workspaceId?: string }>;
}) {
  const currentUser = await (await currentUserProvider()).getCurrentUser();
  if (currentUser === null) redirect('/login');
  const workspaceId = (await searchParams).workspaceId;
  if (!workspaceId) notFound();
  try {
    const {
      PrismaBunshinRepository,
      PrismaOwnerKnowledgeRepository,
      PrismaKnowledgeGrantRepository,
    } = await import('@bunshin/database');
    const bunshin = await new GetBunshin(new PrismaBunshinRepository()).execute({
      workspaceId,
      bunshinId: (await params).bunshinId,
      actorUserId: currentUser.userId,
    });
    const owned = await new PrismaOwnerKnowledgeRepository().listOwned({
      workspaceId,
      actorUserId: currentUser.userId,
    });
    const granted = await new PrismaKnowledgeGrantRepository().listGrantedKnowledge({
      workspaceId,
      actorUserId: currentUser.userId,
      bunshinId: bunshin.id,
    });
    return (
      <BunshinEditor
        workspaceId={workspaceId}
        bunshin={bunshin}
        knowledge={owned.map(({ id, title, type }) => ({
          id,
          title,
          type,
          granted: granted.some((item) => item.id === id),
        }))}
      />
    );
  } catch {
    notFound();
  }
}
