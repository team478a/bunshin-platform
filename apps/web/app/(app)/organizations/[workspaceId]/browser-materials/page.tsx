import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  browserMaterialActor,
  hasBrowserMaterialDetail,
  hasBrowserMaterialImage,
  materialIdSchema,
  readBrowserMaterial,
  searchBrowserMaterials,
} from '../../../../../src/services/browser-materials';
import styles from '../../../../../src/components/browser-material.module.css';
import {
  BrowserMaterialView,
  materialSourceLabel,
  deviceLabel,
} from '../../../../../src/components/browser-material-view';

import { MimikMaterialImportForm } from '../../../../../src/components/mimik-material-import-form';

import { BrowserMaterialVideo } from '../../../../../src/components/browser-material-video';

export const dynamic = 'force-dynamic';

export default async function BrowserMaterialsPage(props: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{
    q?: string | string[];
    material?: string | string[];
    step?: string | string[];
  }>;
}) {
  const { workspaceId } = await props.params;
  const actor = await browserMaterialActor(workspaceId);
  if (!actor) notFound();
  const base = `/organizations/${workspaceId}/browser-materials` as const;
  const search = await props.searchParams;
  const query = typeof search.q === 'string' ? search.q.trim().slice(0, 100) : '';
  if (!search.material) {
    const materials = await searchBrowserMaterials(actor, query);
    return (
      <main className={styles.page}>
        <h1>操作教材</h1>
        <MimikMaterialImportForm workspaceId={workspaceId} />
        <form className={styles.search}>
          <label htmlFor="material-search">教材名</label>
          <input id="material-search" name="q" defaultValue={query} maxLength={100} type="search" />
          <button type="submit">検索</button>
        </form>
        <ul className={styles.list}>
          {materials.map((material) => (
            <li key={material.id}>
              <Link href={{ pathname: base, query: { material: material.id, q: query } }}>
                {material.title}
              </Link>
              <p>{material.goal}</p>
              <small>
                {deviceLabel(material.recipe?.device ?? 'desktop')} · 検証{' '}
                {materialSourceLabel(material)}
              </small>
            </li>
          ))}
        </ul>
        {materials.length === 0 ? <p>教材が見つかりません。</p> : null}
      </main>
    );
  }

  const id = materialIdSchema.safeParse(search.material);
  if (!id.success) notFound();
  const material = await readBrowserMaterial(actor, id.data);
  if (!material) notFound();
  const ordinal =
    typeof search.step === 'string' && /^[1-9]\d{0,8}$/.test(search.step) ? Number(search.step) : 1;
  const step = material.steps[ordinal - 1];
  if (!step) notFound();
  const showDetail =
    !material.importedAt && (await hasBrowserMaterialDetail(actor, material.id, step.ordinal));
  const hasRecordedImage =
    !!material.importedAt &&
    (await hasBrowserMaterialImage(actor, material.id, step.ordinal, 'after'));
  const stepHref = (value: number) => ({
    pathname: base,
    query: { material: material.id, step: value, q: query },
  });
  const materialId = material.id;
  const lessonHref = `${base}?material=${materialId}` as const;
  const db = await import('@bunshin/database');
  const video = await new db.PrismaBrowserMaterialVideos(db.prisma).state(
    { kind: 'owner', owner: actor },
    materialId,
  );
  async function requestVideo() {
    'use server';
    const owner = await browserMaterialActor(workspaceId);
    if (!owner) notFound();
    const db = await import('@bunshin/database');
    await new db.PrismaBrowserMaterialVideos(db.prisma).enqueueVideo(
      { kind: 'owner', owner },
      materialId,
    );
    redirect(lessonHref);
  }
  const imageBase = `/api/browser-materials/${workspaceId}/${material.id}/${step.ordinal}`;

  return (
    <main className={styles.page}>
      <Link href={{ pathname: base, query: { q: query } }}>教材一覧</Link>
      <BrowserMaterialView
        material={material}
        device={material.fixtureDevice ?? material.recipe?.device ?? 'desktop'}
        hasRecordedImage={hasRecordedImage}
        ordinal={ordinal}
        showDetail={showDetail}
        stepHref={stepHref}
        imageHref={(variant) => imageBase + '/' + variant}
      />
      <BrowserMaterialVideo
        state={video}
        requestVideo={requestVideo}
        reloadHref={lessonHref}
        fileHref={(variant) =>
          '/api/browser-materials/' +
          workspaceId +
          '/video?' +
          new URLSearchParams({ material: materialId, variant }).toString()
        }
      />
    </main>
  );
}
