import { notFound } from 'next/navigation';
import { KnowledgeForm } from '../form';
export default async function NewKnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ workspaceId?: string }>;
}) {
  const workspaceId = (await searchParams).workspaceId;
  if (!workspaceId) notFound();
  return <KnowledgeForm workspaceId={workspaceId} />;
}
