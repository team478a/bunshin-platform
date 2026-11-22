import type { Route } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@bunshin/database';
import { ApplicationError } from '@bunshin/shared';
import { ZodError } from 'zod';
import { currentUserProvider } from '../../../../../../src/auth/current-user';
import { fortuneOperatorScope } from '../../../../../../src/fortune/operator-scope';
import {
  hypothesisKinds,
  initialHypotheses,
  interestLabels,
  interestStatuses,
  saveFortuneExperiment,
  saveFortuneHypothesis,
  saveFortuneInterestStatus,
} from '../../../../../../src/fortune/experiments';
import { PublicShell } from '../../../../../ui/public-shell';
import { FortuneExperimentForm } from './experiment-form';

export const dynamic = 'force-dynamic';

async function resolveScope(serviceSlug: string, path: string) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect(`/login?returnTo=${encodeURIComponent(path)}`);
  const service = await fortuneOperatorScope(serviceSlug, actor.userId);
  return { workspaceId: service.workspaceId, groupId: service.serviceId };
}

export default async function FortuneExperimentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ serviceSlug: string }>;
  searchParams: Promise<{ result?: string }>;
}) {
  const { serviceSlug } = await params;
  const query = await searchParams;
  const path = `/s/${serviceSlug}/manage/fortune/experiments`;
  const scope = await resolveScope(serviceSlug, path);
  const [hypotheses, interests, experiments] = await Promise.all([
    prisma.fortuneProductHypothesis.findMany({
      where: scope,
      select: {
        id: true,
        kind: true,
        name: true,
        description: true,
        proposedPriceYen: true,
        externalUrl: true,
        published: true,
        _count: { select: { interests: true } },
      },
    }),
    prisma.fortuneProductInterest.findMany({
      where: scope,
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        hypothesisId: true,
        status: true,
        createdAt: true,
        membership: { select: { user: { select: { displayName: true } } } },
      },
    }),
    prisma.fortuneSalesExperiment.findMany({
      where: scope,
      orderBy: { startsOn: 'desc' },
      take: 50,
    }),
  ]);
  async function save(form: FormData) {
    'use server';
    const scope = await resolveScope(serviceSlug, path);
    const kind = form.get('kind');
    try {
      if (kind === 'hypothesis') {
        await saveFortuneHypothesis(prisma, scope, {
          kind: form.get('hypothesis'),
          name: form.get('name'),
          description: form.get('description'),
          proposedPriceYen: form.get('proposedPriceYen'),
          externalUrl: form.get('externalUrl'),
          published: form.get('published') === 'on',
        });
      } else if (kind === 'interest') {
        await saveFortuneInterestStatus(prisma, scope, {
          id: form.get('id'),
          status: form.get('status'),
        });
      } else if (kind === 'experiment') {
        await saveFortuneExperiment(prisma, scope, {
          id: form.get('id') ?? undefined,
          title: form.get('title'),
          productLabel: form.get('productLabel'),
          startsOn: form.get('startsOn'),
          endsOn: form.get('endsOn'),
          channel: form.get('channel'),
          evidence: {
            lpVersion: form.get('lpVersion'),
            priceYen: form.get('priceYen'),
            advertisingYen: form.get('advertisingYen'),
            purchases: form.get('purchases'),
            salesYen: form.get('salesYen'),
            costsYen: form.get('costsYen'),
            profitYen: form.get('profitYen'),
            changes: form.get('changes'),
            observed: form.get('observed'),
            next: form.get('next'),
            evaluation: form.get('evaluation'),
          },
        });
      } else redirect(`${path}?result=invalid` as Route);
    } catch (error) {
      if (!(error instanceof ZodError || error instanceof ApplicationError)) throw error;
      redirect(`${path}?result=invalid` as Route);
    }
    redirect(`${path}?result=saved` as Route);
  }

  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page">
        <header className="app-page__heading">
          <h1>商品仮説と販売実証</h1>
          <Link href={`/s/${serviceSlug}/manage/fortune` as Route}>占い管理へ戻る</Link>
        </header>
        {query.result === 'saved' && <p role="status">保存しました。</p>}
        {query.result === 'invalid' && <p role="alert">入力値と対象を確認してください。</p>}
        <section className="settings-card">
          <h2>関心を募る企画</h2>
          <p>利用者には関心登録と、設定した場合は外部リンクを案内します。</p>
          {hypothesisKinds.map((kind) => {
            const hypothesis = hypotheses.find((row) => row.kind === kind);
            const values = hypothesis ?? initialHypotheses[kind];
            return (
              <details key={kind}>
                <summary>
                  {values.name}（登録 {hypothesis?._count.interests ?? 0}件）
                </summary>
                <form action={save} className="app-form">
                  <input type="hidden" name="kind" value="hypothesis" />
                  <input type="hidden" name="hypothesis" value={kind} />
                  <label className="form-field">
                    企画名
                    <input name="name" maxLength={120} defaultValue={values.name} required />
                  </label>
                  <label className="form-field">
                    提供案
                    <textarea
                      name="description"
                      maxLength={500}
                      defaultValue={values.description}
                      required
                    />
                  </label>
                  <label className="form-field">
                    価格案（円）
                    <input
                      name="proposedPriceYen"
                      type="number"
                      min={0}
                      max={1_000_000_000}
                      defaultValue={values.proposedPriceYen}
                      required
                    />
                  </label>
                  <label className="form-field">
                    外部案内ページ（任意）
                    <input
                      name="externalUrl"
                      type="url"
                      maxLength={500}
                      defaultValue={hypothesis?.externalUrl ?? ''}
                    />
                  </label>
                  <label>
                    <input
                      name="published"
                      type="checkbox"
                      defaultChecked={hypothesis?.published}
                    />{' '}
                    関心登録を受け付ける
                  </label>
                  <button className="button button--primary" type="submit">
                    企画を保存
                  </button>
                </form>
                {interests
                  .filter(({ hypothesisId }) => hypothesisId === hypothesis?.id)
                  .map((interest) => (
                    <form action={save} key={interest.id} className="button-row">
                      <input type="hidden" name="kind" value="interest" />
                      <input type="hidden" name="id" value={interest.id} />
                      <label className="form-field">
                        {interest.membership.user.displayName}（
                        {interest.createdAt.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' })}
                        ）
                        <select name="status" defaultValue={interest.status}>
                          {interestStatuses.map((status) => (
                            <option value={status} key={status}>
                              {interestLabels[status]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button className="button button--secondary" type="submit">
                        状況を保存
                      </button>
                    </form>
                  ))}
              </details>
            );
          })}
        </section>
        <section className="settings-card">
          <h2>販売実証記録</h2>
          <p>
            別の運営者が再現できる手順や比較条件を記録してください。個人情報や相談内容は入力しないでください。
          </p>
          <details>
            <summary>新規記録</summary>
            <FortuneExperimentForm action={save} />
          </details>
          {experiments.map((experiment) => (
            <details key={experiment.id}>
              <summary>
                {experiment.title}・{experiment.startsOn.toISOString().slice(0, 10)}
              </summary>
              <FortuneExperimentForm action={save} experiment={experiment} />
            </details>
          ))}
        </section>
      </main>
    </PublicShell>
  );
}
