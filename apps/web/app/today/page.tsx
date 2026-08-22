import { ConsumeMissionDeepLinkState } from '@bunshin/application';
import { RecordMissionActivity } from '@bunshin/capability-social';
import { ApplicationError } from '@bunshin/shared';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../src/auth/current-user';
import { HkdfMissionDeepLinkSigner } from '../../src/line/mission-deep-link-signer';
import { currentLineEnvironment } from '../../src/line/secure-configuration';

export const dynamic = 'force-dynamic';

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');
  const token = (await searchParams).state;
  if (!token || token.length > 2048) notFound();
  const db = await import('@bunshin/database');
  try {
    const state = await new ConsumeMissionDeepLinkState(
      new db.PrismaMissionDeepLinkStateRepository(),
      new HkdfMissionDeepLinkSigner(),
    ).execute({ token, environment: currentLineEnvironment(), actorUserId: user.userId });
    await new RecordMissionActivity(
      new db.PrismaDailyMissionRepository(),
      new db.PrismaBunshinCapabilityAssignmentRepository(),
      new db.PrismaMissionEngagementRepository(),
    ).execute({
      workspaceId: state.workspaceId,
      actorUserId: user.userId,
      bunshinId: state.bunshinId,
      dailyMissionId: state.dailyMissionId,
      type: 'VIEWED',
      idempotencyKey: `line-deep-link:${state.id}`,
      metadata: null,
    });
    redirect(`/bunshins/${state.bunshinId}#daily-mission`);
  } catch (error) {
    if (error instanceof ApplicationError) notFound();
    throw error;
  }
}
