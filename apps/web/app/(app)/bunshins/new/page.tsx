import { notFound } from 'next/navigation';
import { BunshinWizard } from './wizard';

export default async function NewBunshinPage({
  searchParams,
}: {
  searchParams: Promise<{ workspaceId?: string }>;
}) {
  const workspaceId = (await searchParams).workspaceId;
  if (!workspaceId) notFound();
  return <BunshinWizard workspaceId={workspaceId} />;
}
