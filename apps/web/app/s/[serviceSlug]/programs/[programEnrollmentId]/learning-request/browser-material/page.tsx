import design from '../../../../../../../src/components/manaberu-learner.module.css';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getServerEnvironment } from '@bunshin/config';
import { ApplicationError } from '@bunshin/shared';
import { BrowserMaterialView } from '../../../../../../../src/components/browser-material-view';
import {
  BrowserMaterialManualLinks,
  BrowserMaterialPrint,
} from '../../../../../../../src/components/browser-material-print';
import styles from '../../../../../../../src/components/browser-material.module.css';
import {
  browserLearningMaterialActor,
  enqueueBrowserLearningMaterial,
  learningMaterialPath,
} from '../../../../../../../src/services/browser-learning-material';

import { BrowserMaterialVideo } from '../../../../../../../src/components/browser-material-video';
import { lessonNarrationSelection } from '../../../../../../../src/services/browser-material-video';

export const dynamic = 'force-dynamic';

export default async function BrowserLearningMaterialPage({
  params,
  searchParams,
}: {
  params: Promise<{ serviceSlug: string; programEnrollmentId: string }>;
  searchParams: Promise<{
    topicId?: string;
    step?: string;
    narrator?: string;
    print?: string;
    format?: string | string[];
  }>;
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
    const print = query.print === '1';
    const state = await materials.readMaterial(actor, { print });
    if (!state) notFound();
    const path = learningMaterialPath(serviceSlug, programEnrollmentId, actor.topicId);
    const pathname = learningMaterialPath(serviceSlug, programEnrollmentId);
    const topic = actor.topicId ? { topicId: actor.topicId } : {};
    const materialHref = { pathname, query: topic };
    const home = {
      pathname: pathname.replace('/learning-request/browser-material', '/learning-request'),
      query: topic,
    };
    const material = state.material;
    const imageHref = (
      materialId: string,
      ordinal: number,
      variant: 'before' | 'after' | 'detail',
    ) =>
      pathname +
      '/image?' +
      new URLSearchParams({
        ...topic,
        material: materialId,
        step: String(ordinal),
        variant,
      }).toString();
    if (print) {
      if (!material) notFound();
      return (
        <BrowserMaterialPrint
          material={{ ...material, verifiedAt: material.reviewedAt ?? material.verifiedAt }}
          device={state.device}
          images={state.printImages}
          imageHref={(ordinal, variant) => imageHref(material.id, ordinal, variant)}
          backHref={materialHref}
          webMaterialUrl={new URL(path, getServerEnvironment().APP_URL).toString()}
          reviewFailed={state.reviewStatus === 'DEAD'}
          requestedStyle={query.format}
        />
      );
    }
    const ordinal = query.step === undefined ? 1 : Number(query.step);
    const step = material?.steps[ordinal - 1];
    if (material && (!Number.isSafeInteger(ordinal) || !step)) notFound();
    const showDetail =
      material && step
        ? !!(await materials.readImage(actor, material.id, ordinal, 'detail'))
        : false;

    async function requestMaterial(failedJobId: string | null) {
      'use server';
      const current = await browserLearningMaterialActor(
        serviceSlug,
        programEnrollmentId,
        query.topicId,
        true,
      );
      await enqueueBrowserLearningMaterial(current, failedJobId ?? undefined);
      redirect(learningMaterialPath(serviceSlug, programEnrollmentId, current.topicId));
    }

    const materialId = material?.id;
    const videos = new db.PrismaBrowserMaterialVideos(db.prisma);
    const speech = material?.verifiedAt
      ? await videos.speechAvailability(actor.scope.workspaceId)
      : { enabled: false, previews: false };
    const narrator = lessonNarrationSelection(speech.enabled, material ?? null, query.narrator);
    const narratorPath = learningMaterialPath(
      serviceSlug,
      programEnrollmentId,
      actor.topicId,
      narrator.voice,
    );
    const video = materialId
      ? await videos.state({ kind: 'learner', learner: actor }, materialId, narrator.version)
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
        narrator.version,
      );
      redirect(
        learningMaterialPath(serviceSlug, programEnrollmentId, learner.topicId, narrator.voice),
      );
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
      <main className={`${design.frame} ${styles.page} ${styles.learnerPage}`}>
        <nav className={styles.learnerLinks} aria-label="教材ナビゲーション">
          <Link href={home}>個別学習に戻る</Link>
          {material && <a href="#pdf-manual-title">PDFを使う</a>}
        </nav>
        {material ? (
          <>
            <BrowserMaterialView
              material={{ ...material, verifiedAt: material.reviewedAt ?? material.verifiedAt }}
              device={state.device}
              ordinal={ordinal}
              showDetail={showDetail}
              learner={{ practiceHref: { ...home, hash: 'practice-record' } }}
              stepHref={(value) => ({
                pathname,
                query: {
                  ...topic,
                  step: value,
                  ...(narrator.voice ? { narrator: narrator.voice } : {}),
                },
              })}
              imageHref={(variant) => imageHref(material.id, ordinal, variant)}
              guidance={
                state.device === 'mobile'
                  ? 'スマートフォンのブラウザで、ボタンをタップして進めましょう。'
                  : 'パソコンのブラウザで、ボタンをクリックして進めましょう。'
              }
            />
            <section aria-labelledby="pdf-manual-title">
              <h2 id="pdf-manual-title">PDFマニュアル</h2>
              <BrowserMaterialManualLinks materialHref={materialHref} />
            </section>
            <BrowserMaterialVideo
              state={video}
              requestVideo={requestVideo}
              reloadHref={narratorPath}
              {...(narrator.voice
                ? {
                    choice: {
                      voice: narrator.voice,
                      showPreviews: speech.previews,
                      href: (voice) =>
                        learningMaterialPath(
                          serviceSlug,
                          programEnrollmentId,
                          actor.topicId,
                          voice,
                        ),
                    },
                  }
                : {})}
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
            <section aria-labelledby="material-help-title">
              <h2 id="material-help-title">操作に困ったとき</h2>
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
          <section aria-labelledby="material-preparation-title">
            <h1 id="material-preparation-title">画像付き操作教材</h1>
            {!state.canGenerate ? (
              <p>
                この端末向けの検証済みレシピは準備中です。個別学習から質問や実践を続けられます。
              </p>
            ) : state.status === null ? (
              <form action={requestMaterial.bind(null, null)}>
                <button type="submit">画像付き教材を作る</button>
              </form>
            ) : state.failedJobId ? (
              <form action={requestMaterial.bind(null, state.failedJobId)}>
                <p role="status">教材を準備できませんでした。</p>
                <button type="submit">教材の生成を再試行する</button>
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
