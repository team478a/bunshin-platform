import type { Route } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@bunshin/database';
import { ApplicationError } from '@bunshin/shared';
import { ZodError } from 'zod';
import { changeFortuneInterest, interestLabels } from '../../../../src/fortune/experiments';
import { resolveFortunePage } from '../../../../src/fortune/page-context';
import { PublicShell } from '../../../ui/public-shell';

export const dynamic = 'force-dynamic';

export default async function FortuneOpportunitiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ serviceSlug: string }>;
  searchParams: Promise<{ result?: string }>;
}) {
  const { serviceSlug } = await params;
  const query = await searchParams;
  const path = `/s/${serviceSlug}/fortune-opportunities`;
  const { actor, service } = await resolveFortunePage(serviceSlug, path);
  const scope = { workspaceId: service.workspaceId, groupId: service.serviceId };
  const hypotheses = await prisma.fortuneProductHypothesis.findMany({
    where: {
      ...scope,
      OR: [{ published: true }, { interests: { some: { memberUserId: actor.userId } } }],
    },
    orderBy: { kind: 'asc' },
    include: { interests: { where: { memberUserId: actor.userId }, select: { status: true } } },
  });

  async function save(form: FormData) {
    'use server';
    const { actor, service } = await resolveFortunePage(serviceSlug, path);
    try {
      await changeFortuneInterest(
        prisma,
        {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          memberUserId: actor.userId,
        },
        { id: form.get('id'), interested: form.get('interest') === 'yes' },
      );
    } catch (error) {
      if (!(error instanceof ApplicationError || error instanceof ZodError)) throw error;
      redirect(`${path}?result=unavailable` as Route);
    }
    redirect(path);
  }

  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page fortune-page">
        <header className="app-page__heading">
          <h1>今後の企画</h1>
          <p>関心を登録すると、サービス運営から企画のご案内を受け取れます。登録は無料です。</p>
        </header>
        {query.result === 'unavailable' && (
          <p role="alert">現在、この企画の関心登録は受け付けていません。</p>
        )}
        {hypotheses.length === 0 && <p>現在、関心登録を募集中の企画はありません。</p>}
        {hypotheses.map((hypothesis) => {
          const interest = hypothesis.interests[0];
          return (
            <section className="settings-card" key={hypothesis.id}>
              <h2>{hypothesis.name}</h2>
              {hypothesis.published ? (
                <>
                  <p>{hypothesis.description}</p>
                  <p>価格案 {hypothesis.proposedPriceYen.toLocaleString('ja-JP')}円</p>
                  {hypothesis.externalUrl && (
                    <p>
                      <a href={hypothesis.externalUrl} rel="noreferrer" target="_blank">
                        外部サイトで企画の詳細を見る
                      </a>
                    </p>
                  )}
                </>
              ) : (
                <p>この企画の募集は終了しました。</p>
              )}
              {interest && <p role="status">登録状況 {interestLabels[interest.status]}</p>}
              {(hypothesis.published || interest) && (
                <form action={save}>
                  <input type="hidden" name="id" value={hypothesis.id} />
                  <input type="hidden" name="interest" value={interest ? 'no' : 'yes'} />
                  <button className="button button--secondary" type="submit">
                    {interest ? '関心登録を取り消す' : '案内を希望する'}
                  </button>
                </form>
              )}
            </section>
          );
        })}
        <Link href={`/s/${serviceSlug}/today` as Route}>今日の占いに戻る</Link>
      </main>
    </PublicShell>
  );
}
