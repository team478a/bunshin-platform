import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  browserMaterialActor,
  hasBrowserMaterialDetail,
  materialIdSchema,
  readBrowserMaterial,
  searchBrowserMaterials,
} from '../../../../../src/services/browser-materials';
import styles from './materials.module.css';

export const dynamic = 'force-dynamic';

const deviceLabel = (device: string) =>
  device === 'mobile' ? 'スマートフォンのブラウザ' : 'パソコンのブラウザ';
const dateLabel = (date: Date) =>
  new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'long',
    timeZone: 'Asia/Tokyo',
  }).format(date);

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
                {deviceLabel(material.recipe.device)} · 検証 {dateLabel(material.verifiedAt)}
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
  const showDetail = await hasBrowserMaterialDetail(actor, material.id, step.ordinal);
  const stepHref = (value: number) => ({
    pathname: base,
    query: { material: material.id, step: value, q: query },
  });
  const imageBase = `/api/browser-materials/${workspaceId}/${material.id}/${step.ordinal}`;

  return (
    <main className={styles.page}>
      <Link href={{ pathname: base, query: { q: query } }}>教材一覧</Link>
      <header>
        <h1>{material.title}</h1>
        <p>{material.goal}</p>
        <small>
          {deviceLabel(material.recipe.device)} · 検証 {dateLabel(material.verifiedAt)}
        </small>
      </header>
      <details>
        <summary>準備</summary>
        <p>{material.preparation}</p>
      </details>
      <section className={styles.step} aria-labelledby="material-step">
        <h2 id="material-step">
          手順 {step.ordinal} / {material.steps.length}
        </h2>
        <p>{step.instruction}</p>
        <div className={styles.images}>
          {(['before', 'after'] as const).map((variant) => (
            <figure key={variant}>
              <a href={`${imageBase}/${variant}`} target="_blank" rel="noopener noreferrer">
                <Image
                  src={`${imageBase}/${variant}`}
                  alt={variant === 'before' ? '操作前の画面' : '操作後の画面'}
                  width={640}
                  height={480}
                  unoptimized
                />
              </a>
              <figcaption>
                {variant === 'before' ? '操作前' : '操作後'} · 画像を開いて拡大
              </figcaption>
            </figure>
          ))}
        </div>
        {showDetail ? (
          <details className={styles.detail}>
            <summary>操作箇所を拡大</summary>
            <a href={`${imageBase}/detail`} target="_blank" rel="noopener noreferrer">
              <Image
                src={`${imageBase}/detail`}
                alt="操作箇所の拡大画像"
                width={480}
                height={260}
                unoptimized
              />
            </a>
          </details>
        ) : null}
        <nav className={styles.navigation} aria-label="教材の手順">
          {ordinal > 1 ? <Link href={stepHref(ordinal - 1)}>前へ</Link> : <span />}
          {ordinal < material.steps.length ? <Link href={stepHref(ordinal + 1)}>次へ</Link> : null}
        </nav>
      </section>
      {ordinal === material.steps.length ? (
        <section className={styles.step}>
          <h2>実践課題</h2>
          <p>{material.practice}</p>
          <h3>理解度確認</h3>
          <p>{material.checkpoint}</p>
        </section>
      ) : null}
    </main>
  );
}
