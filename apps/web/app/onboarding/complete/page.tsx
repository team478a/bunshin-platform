import { redirect } from 'next/navigation';
import { currentUserProvider } from '../../../src/auth/current-user';
import { FirstPostCard } from './first-post-card';
import { recordAuthenticatedRegistrationEvent } from '../../../src/registration/funnel';

export const dynamic = 'force-dynamic';

type FirstPostSuggestion = { title: string; body: string; version: string };

function suggestionFrom(value: unknown): FirstPostSuggestion | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  return typeof item.title === 'string' &&
    typeof item.body === 'string' &&
    typeof item.version === 'string'
    ? { title: item.title, body: item.body, version: item.version }
    : null;
}

export default async function OnboardingCompletePage() {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const db = await import('@bunshin/database');
  const profile = await db.prisma.userRegistrationProfile.findUnique({
    where: { userId: actor.userId },
    select: { status: true, firstPostSuggestion: true },
  });
  if (profile?.status !== 'COMPLETED') redirect('/onboarding');
  await recordAuthenticatedRegistrationEvent({
    eventType: 'FIRST_POST_VIEWED',
    userId: actor.userId,
    source: 'ONBOARDING_COMPLETE',
  });
  const suggestion = suggestionFrom(profile.firstPostSuggestion);
  return (
    <main className="app-page onboarding-page">
      <header className="onboarding-header">
        <p className="eyebrow">初期設定が完了しました</p>
        <h1>最初の投稿案ができました</h1>
        <p>ご自身の事実や言葉に合わせて編集し、内容を確認してから投稿してください。</p>
      </header>
      {suggestion ? <FirstPostCard suggestion={suggestion} /> : null}
      <p>
        <a className="button button--primary" href="/bunshins">
          ワタシワークスを使いはじめる
        </a>
      </p>
    </main>
  );
}
