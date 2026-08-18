import { GetOwnerKnowledge } from '@bunshin/application';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { KnowledgeForm } from '../form';
export const dynamic = 'force-dynamic';
export default async function KnowledgeDetail({
  params,
  searchParams,
}: {
  params: Promise<{ knowledgeId: string }>;
  searchParams: Promise<{ workspaceId?: string }>;
}) {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');
  const workspaceId = (await searchParams).workspaceId;
  if (!workspaceId) notFound();
  try {
    const { PrismaOwnerKnowledgeRepository } = await import('@bunshin/database');
    const item = await new GetOwnerKnowledge(new PrismaOwnerKnowledgeRepository()).execute({
      workspaceId,
      knowledgeId: (await params).knowledgeId,
      actorUserId: user.userId,
    });
    return (
      <KnowledgeForm
        workspaceId={workspaceId}
        item={{ id: item.id, type: item.type, title: item.title, content: item.content }}
      />
    );
  } catch {
    notFound();
  }
}
