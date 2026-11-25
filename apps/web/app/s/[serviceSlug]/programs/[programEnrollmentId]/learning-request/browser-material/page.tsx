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

import { BrowserMaterialVideo } from '../../../../../../../src/components/browser-material-video';

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
    const pathname = learningMaterialPath(serviceSlug, programEnrollmentId);
    const topic = actor.topicId ? { topicId: actor.topicId } : {};
    const home = {
      pathname: pathname.replace('/learning-request/browser-material', '/learning-request'),
      query: topic,
    };
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

    const materialId = material?.id;
    const video = materialId
      ? await new db.PrismaBrowserMaterialVideos(db.prisma).state(
          { kind: 'learner', learner: actor },
          materialId,
        )
      : null;

    async function requestVideo() {
      'use server';
      if (!materialId) return;
      const learner = await browserLearningMaterialActor(
        serviceSlug,
        programEnrollmentId,
        query.topicId,
        true,
      );
      const db = await import('@bunshin/database');
      await new db.PrismaBrowserMaterialVideos(db.prisma).enqueueVideo(
        { kind: 'learner', learner },
        materialId,
      );
      redirect(learningMaterialPath(serviceSlug, programEnrollmentId, learner.topicId));
    }
    async function reportDifference() {
      'use server';
      if (!materialId) return;
      const current = await browserLearningMaterialActor(
        serviceSlug,
        programEnrollmentId,
        query.topicId,
        true,
      );
      const db = await import('@bunshin/database');
      await new db.PrismaBrowserLearningMaterials(db.prisma).enqueueReview(current, materialId);
      redirect(learningMaterialPath(serviceSlug, programEnrollmentId, current.topicId));
    }

    return (
      <main className={styles.page}>
        <Link href={home}>個別学習に戻る</Link>
        <h1>画像付き操作教材</h1>
        {material ? (
          <>
            <BrowserMaterialView
              material={{ ...material, verifiedAt: material.reviewedAt ?? material.verifiedAt }}
              device={state.device}
              ordinal={ordinal}
              showDetail={showDetail}
              stepHref={(value) => ({ pathname, query: { ...topic, step: value } })}
              imageHref={(variant) =>
                pathname +
                '/image?' +
                new URLSearchParams({
                  ...topic,
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
            <BrowserMaterialVideo
              state={video}
              requestVideo={requestVideo}
              reloadHref={path}
              fileHref={(variant, version) =>
                pathname +
                '/video?' +
                new URLSearchParams({
                  ...topic,
                  material: material.id,
                  variant,
                  version: String(version),
                }).toString()
              }
            />
            <section aria-label="画面の違い">
              <small>教材 第{material.revision}版</small>
              {state.canReview && (
                <form action={reportDifference}>
                  <button type="submit">教材と画面が違う</button>
                </form>
              )}
              {state.reviewStatus === 'DEAD' ? (
                <p role="status">再検証で操作を確認できなかったため、前の教材を表示しています。</p>
              ) : state.reviewStatus &&
                ['PENDING', 'LEASED', 'RETRY_SCHEDULED'].includes(state.reviewStatus) ? (
                <p role="status">教材の画面を再検証しています。</p>
              ) : null}
              <Link href={{ ...home, hash: 'practice-record' }}>
                分からない操作を個別学習で相談する
              </Link>
            </section>
          </>
        ) : (
          <section aria-label="教材の準備">
            {!state.canGenerate ? (
              <p>
                この端末向けの検証済みレシピは準備中です。個別学習から質問や実践を続けられます。
              </p>
            ) : state.status === null ? (
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
