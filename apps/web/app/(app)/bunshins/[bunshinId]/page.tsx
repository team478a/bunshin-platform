import {
  GetBunshin,
  ListBunshinCapabilityAssignments,
  ListBunshinMemories,
} from '@bunshin/application';
import { notFound, redirect } from 'next/navigation';
import { ListSocialProfiles } from '@bunshin/capability-social';
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
      PrismaBunshinMemoryRepository,
      PrismaBunshinCapabilityAssignmentRepository,
      PrismaSocialProfileRepository,
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
    const memories = await new ListBunshinMemories(new PrismaBunshinMemoryRepository()).execute({
      workspaceId,
      actorUserId: currentUser.userId,
      bunshinId: bunshin.id,
      includeInactive: true,
    });
    const capabilities = await new ListBunshinCapabilityAssignments(
      new PrismaBunshinCapabilityAssignmentRepository(),
    ).execute({
      workspaceId,
      actorUserId: currentUser.userId,
      bunshinId: bunshin.id,
    });
    const socialProfiles = await new ListSocialProfiles(
      new PrismaSocialProfileRepository(),
    ).execute({
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
        memories={memories.map(
          ({ id, type, content, summary, confidence, importance, active }) => ({
            id,
            type,
            content,
            summary,
            confidence,
            importance,
            active,
          }),
        )}
        socialCapabilityStatus={
          capabilities.find(({ capabilityType }) => capabilityType === 'SOCIAL')?.status ?? null
        }
        socialProfiles={socialProfiles.map(
          ({
            platform,
            handle,
            profileUrl,
            purpose,
            postingFrequency,
            preferredFormats,
            status,
          }) => ({
            platform,
            handle,
            profileUrl,
            purpose,
            postingFrequency,
            preferredFormats,
            status,
          }),
        )}
      />
    );
  } catch {
    notFound();
  }
}
