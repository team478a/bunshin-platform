import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ApplicationError } from '@bunshin/shared';
import { BrowserMaterialView } from '../../../../../../../src/components/browser-material-view';
import styles from '../../../../../../../src/components/browser-material.module.css';
import {
  browserLearningMaterialActor,
  enqueueBrowserLearningMaterial,
  learningMaterialPath,
} from '../../../../../../../src/services/browser-learning-material';

export const dynamic = 'force-dynamic';

export default async function BrowserLearningMaterialPage({
  params,
  searchParams,
}: {
  params: Promise<{ serviceSlug: string; programEnrollmentId: string }>;
  searchParams: Promise<{ topicId?: string; step?: string }>;
}) {
  const { serviceSlug, programEnrollmentId } = await params;
  const query = await searchParams;
  try {
    const actor = await browserLearningMaterialActor(
      serviceSlug,
      programEnrollmentId,
      query.topicId,
      true,
    );
    const db = await import('@bunshin/database');
    const materials = new db.PrismaBrowserLearningMaterials(db.prisma);
    const state = await materials.readMaterial(actor);
    if (!state) notFound();
    const path = learningMaterialPath(serviceSlug, programEnrollmentId, actor.topicId);
    const topic = new URLSearchParams(actor.topicId ? { topicId: actor.topicId } : {});
    const home = path.replace('/learning-request/browser-material', '/learning-request');
    const material = state.material;
    const ordinal = query.step === undefined ? 1 : Number(query.step);
    const step = material?.steps[ordinal - 1];
    if (material && (!Number.isSafeInteger(ordinal) || !step)) notFound();
    const showDetail =
      material && step
        ? !!(await materials.readImage(actor, material.id, ordinal, 'detail'))
        : false;

    async function requestMaterial() {
      'use server';
      const current = await browserLearningMaterialActor(
        serviceSlug,
        programEnrollmentId,
        query.topicId,
        true,
      );
      await enqueueBrowserLearningMaterial(current);
      redirect(learningMaterialPath(serviceSlug, programEnrollmentId, current.topicId));
    }

    return (
      <main className={styles.page}>
        <Link href={home}>個別学習に戻る</Link>
        <h1>画像付き操作教材</h1>
        {material ? (
          <>
            <BrowserMaterialView
              material={material}
              device={state.device}
              ordinal={ordinal}
              showDetail={showDetail}
              stepHref={(value) => path + (actor.topicId ? '&' : '?') + 'step=' + value}
              imageHref={(variant) =>
                path.split('?')[0] +
                '/image?' +
                new URLSearchParams({
                  ...Object.fromEntries(topic),
                  material: material.id,
                  step: String(ordinal),
                  variant,
                }).toString()
              }
              guidance={
                state.device === 'mobile'
                  ? 'スマートフォンのブラウザで、ボタンをタップして進めましょう。'
                  : 'パソコンのブラウザで、ボタンをクリックして進めましょう。'
              }
            />
            <Link href={home}>分からない操作を個別学習で相談する</Link>
          </>
        ) : (
          <section aria-label="教材の準備">
            {state.status === null ? (
              <form action={requestMaterial}>
                <button type="submit">画像付き教材を作る</button>
              </form>
            ) : ['DEAD', 'CANCELLED', 'SUCCEEDED'].includes(state.status) ? (
              <p>教材を準備できませんでした。個別学習から質問や実践を続けられます。</p>
            ) : (
              <>
                <p role="status">教材を準備中です。個別学習は引き続き利用できます。</p>
                <a href={path}>準備状況を確認する</a>
              </>
            )}
          </section>
        )}
      </main>
    );
  } catch (error) {
    if (error instanceof ApplicationError && ['NOT_FOUND', 'FORBIDDEN'].includes(error.code))
      notFound();
    throw error;
  }
}
